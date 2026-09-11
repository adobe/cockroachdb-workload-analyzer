// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package loader

import (
	"database/sql"
	"fmt"
	"os"
	"sync"

	_ "github.com/marcboeker/go-duckdb"
)

// LoadStatus tracks progressive loading state.
type LoadStatus struct {
	mu       sync.RWMutex
	state    string
	progress float64
	tables   []TableEntry
}

type TableEntry struct {
	Name   string `json:"name"`
	Loaded bool   `json:"loaded"`
	Err    string `json:"error,omitempty"`
}

// tableConfigs maps CSV filename → DuckDB table name, in load priority order.
// Small tables first; statement_statistics.csv (potentially ~969 MB) last.
var tableConfigs = []struct {
	csvName   string
	tableName string
}{
	{"crdb_internal.cluster_settings.csv", "cluster_settings"},
	{"crdb_internal.cluster_settings.system.csv", "cluster_settings_system"},
	{"system.settings.csv", "system_settings"},
	{"crdb_internal.gossip_nodes.csv", "gossip_nodes"},
	{"crdb_internal.index_usage_statistics.csv", "idx_usage"},
	{"crdb_internal.table_indexes.csv", "table_indexes"},
	{"crdb_internal.node_cpu_mem.csv", "node_cpu_mem"},
	{"crdb_internal.transaction_contention_events.csv", "txn_contention"},
	{"system.table_statistics.csv", "table_stats"},
	{"crdb_internal.transaction_statistics.csv", "txn_stats"},
	{"crdb_internal.statement_statistics.csv", "stmt_stats"},
}

func NewLoadStatus() *LoadStatus {
	return &LoadStatus{state: "loading"}
}

func (s *LoadStatus) State() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

func (s *LoadStatus) Progress() float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.progress
}

func (s *LoadStatus) Snapshot() (state string, progress float64, tables []TableEntry) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cp := make([]TableEntry, len(s.tables))
	copy(cp, s.tables)
	return s.state, s.progress, cp
}

func (s *LoadStatus) addEntry(name string, loaded bool, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tables = append(s.tables, TableEntry{Name: name, Loaded: loaded, Err: errMsg})
}

func (s *LoadStatus) setProgress(p float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.progress = p
}

// SetReady marks loading complete. The caller flips this — not LoadCSVs —
// because "ready" gates free-form SQL in the API: main calls Store.Seal
// between LoadCSVs and SetReady, so "ready" also guarantees the database is
// read-only and can no longer read local files or reach the network.
func (s *LoadStatus) SetReady() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state = "ready"
	s.progress = 1.0
}

// HardenDuckDB disables external file/network access and then locks the
// configuration. Store.Seal applies it to the read-only handle it opens:
// after this, the free-form SQL editor can no longer read arbitrary local
// files via SQL (read_csv/COPY/ATTACH/extension loading), while queries over
// the loaded tables keep working. DuckDB makes external access a one-way
// switch — it can't be re-enabled while the database is running — and
// lock_configuration additionally freezes every other setting, so a SQL-tab
// user can't redirect writes (temp_directory, home_directory) or turn on
// extension autoinstall either. Order matters: nothing can be SET after the
// lock, so it must come last.
func HardenDuckDB(db *sql.DB) error {
	if _, err := db.Exec("SET enable_external_access=false"); err != nil {
		return fmt.Errorf("disabling external access: %w", err)
	}
	if _, err := db.Exec("SET lock_configuration=true"); err != nil {
		return fmt.Errorf("locking configuration: %w", err)
	}
	return nil
}

// execer is the slice of *sql.DB (or *Store) the loader needs: it only ever
// runs statements, never reads rows.
type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

// LoadCSVs loads CSVs from files into db, updating status as each table completes.
// Missing CSV files are skipped (not all exports include all tables).
// Errors loading individual tables are recorded in status but don't abort loading.
// It does NOT mark the status ready — the caller does that via SetReady after
// any post-load steps (in particular Store.Seal).
func LoadCSVs(db execer, files ExtractedFiles, status *LoadStatus) {
	total := float64(len(tableConfigs))
	for i, cfg := range tableConfigs {
		path, ok := files[cfg.csvName]
		if !ok {
			status.addEntry(cfg.tableName, false, "not in export")
			status.setProgress(float64(i+1) / total)
			continue
		}
		if err := loadCSVTable(db, cfg.tableName, path); err != nil {
			status.addEntry(cfg.tableName, false, err.Error())
		} else {
			if cfg.tableName == "stmt_stats" {
				if err := normalizeStmtStatsDB(db); err != nil {
					// Non-fatal: filtering/dropdown degrade, but the table is usable.
					fmt.Fprintf(os.Stderr, "warning: normalizing stmt_stats database column: %v\n", err)
				}
			}
			status.addEntry(cfg.tableName, true, "")
		}
		status.setProgress(float64(i+1) / total)
	}
}

// normalizeStmtStatsDB guarantees stmt_stats has a populated top-level `database`
// column. Newer workload-exporter exports ship it natively (and leave the JSON
// copy metadata.$.db an empty string); older exports carried the database name
// only inside the metadata blob. We reconcile both so the database dropdown and
// every catalog query's DBFilterExpr can rely on a single `database` column:
//   - add the column if the export predates it, then
//   - backfill any NULL/blank value from metadata.$.db.
func normalizeStmtStatsDB(db execer) error {
	if _, err := db.Exec(`ALTER TABLE stmt_stats ADD COLUMN IF NOT EXISTS database VARCHAR`); err != nil {
		return fmt.Errorf("adding database column: %w", err)
	}
	if _, err := db.Exec(`
		UPDATE stmt_stats
		SET database = json_extract_string(metadata, '$.db')
		WHERE (database IS NULL OR database = '')
		  AND NULLIF(json_extract_string(metadata, '$.db'), '') IS NOT NULL
	`); err != nil {
		return fmt.Errorf("backfilling database column: %w", err)
	}
	return nil
}

func loadCSVTable(db execer, tableName, csvPath string) error {
	// Use read_csv_auto for fast bulk loading with automatic type inference.
	// ignore_errors skips malformed rows rather than aborting the whole load.
	q := fmt.Sprintf(
		"CREATE TABLE %s AS SELECT * FROM read_csv_auto('%s', header=true, ignore_errors=true)",
		tableName, csvPath,
	)
	_, err := db.Exec(q)
	return err
}
