// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package catalog_test

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
	_ "github.com/marcboeker/go-duckdb"
)

// openMemDB opens a throwaway in-memory DuckDB. Production loads into a
// file-backed loader.Store so it can be reopened read-only; these tests only
// check the catalog SQL, which runs the same either way.
func openMemDB() (*sql.DB, error) {
	db, err := sql.Open("duckdb", "")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

// csvFixture is one CSV file written to disk and loaded exactly like a real
// export (via read_csv_auto), so the test exercises DuckDB's type inference and
// the production load path — not a hand-built in-memory schema.
type csvFixture struct {
	name   string // export CSV filename (must match loader.tableConfigs)
	header []string
	rows   [][]string
}

// fixtures mirror the shape of the real CockroachDB export closely enough to
// exercise every catalog query: raw JSON metadata/statistics blobs, the native
// `database`/`query` columns added in newer exports, and the exact column names
// each query references. The statistics JSON deliberately carries
// `latencyInfo.max` (present in real exports) but NOT `runLat.max`/`commitLat.max`
// (absent in real exports) — so a regression back to those dead paths is caught.
func fixtures() []csvFixture {
	// metadata deliberately omits "query" AND "db" — in real newer exports both
	// live in native top-level columns (`query`, `database`) and the JSON copies
	// are empty: metadata.$.query is populated for only ~2% of rows and
	// metadata.$.db is an empty string. Database name and query text must come
	// from the native columns; a regression to json_extract_string(metadata,...)
	// yields empty values here (mirroring 2026-era exports).
	const meta1 = `{"db":"","fullScan":true}`
	const meta2 = `{"db":"","fullScan":false}`
	// execution_statistics is sampled: contentionTime is seconds, maxMemUsage/
	// maxDiskUsage bytes, admissionWaitTime nanoseconds, matching real exports.
	// fp1: two buckets (tests aggregation), high failure rate, index rec, full scan.
	stats1a := `{"statistics":{"cnt":100,"failureCount":5,"runLat":{"mean":0.5},` +
		`"numRows":{"mean":10},"rowsRead":{"mean":1000},"rowsWritten":{"mean":0},` +
		`"parseLat":{"mean":0.001},"planLat":{"mean":0.05},"idleLat":{"mean":0},"ovhLat":{"mean":0.01},"svcLat":{"mean":0.561},` +
		`"latencyInfo":{"max":2.5}},"execution_statistics":{"cnt":50,"cpuSQLNanos":{"mean":300000},` +
		`"contentionTime":{"mean":0.01},"maxMemUsage":{"mean":20971520},"maxDiskUsage":{"mean":0},` +
		`"admissionWaitTime":{"mean":1500}},"index_recommendations":["creation : CREATE INDEX ON t (a)"]}`
	stats1b := `{"statistics":{"cnt":100,"failureCount":5,"runLat":{"mean":0.6},` +
		`"numRows":{"mean":12},"rowsRead":{"mean":1200},"rowsWritten":{"mean":0},` +
		`"parseLat":{"mean":0.001},"planLat":{"mean":0.06},"idleLat":{"mean":0},"ovhLat":{"mean":0.01},"svcLat":{"mean":0.671},` +
		`"latencyInfo":{"max":3.0}},"execution_statistics":{"cnt":50,"cpuSQLNanos":{"mean":350000},` +
		`"contentionTime":{"mean":0.02},"maxMemUsage":{"mean":31457280},"maxDiskUsage":{"mean":1048576},` +
		`"admissionWaitTime":{"mean":2000}},"index_recommendations":["creation : CREATE INDEX ON t (a)"]}`
	stats2 := `{"statistics":{"cnt":10,"failureCount":0,"runLat":{"mean":0.05},` +
		`"numRows":{"mean":1},"rowsRead":{"mean":1},"rowsWritten":{"mean":5},` +
		`"parseLat":{"mean":0},"planLat":{"mean":0.001},"idleLat":{"mean":0},"ovhLat":{"mean":0},"svcLat":{"mean":0.05},` +
		`"latencyInfo":{"max":0.1}},"execution_statistics":{"cnt":5,"cpuSQLNanos":{"mean":100000},` +
		`"contentionTime":{"mean":0},"maxMemUsage":{"mean":0},"maxDiskUsage":{"mean":0},` +
		`"admissionWaitTime":{"mean":0}},"index_recommendations":[]}`

	txn1 := `{"statistics":{"cnt":50,"maxRetries":3,"retryLat":{"mean":0.02},"commitLat":{"mean":0.10},"svcLat":{"mean":0.30}}}`
	txn2 := `{"statistics":{"cnt":20,"maxRetries":0,"retryLat":{"mean":0.0},"commitLat":{"mean":0.05},"svcLat":{"mean":0.08}}}`

	return []csvFixture{
		{
			name: "crdb_internal.statement_statistics.csv",
			// transaction_fingerprint_id is a native `\x`-prefixed column (same form
			// as txn_stats.fingerprint_id); it wires each statement to its parent
			// transaction so the txn->stmt breakdown query and drawer join resolve.
			// app_name is the native column real exports carry (the percentile query
			// groups by it); fp1 runs under "graphql", fp2 under "oban".
			header: []string{"fingerprint_id", "transaction_fingerprint_id", "metadata", "statistics", "database", "query", "plan_hash", "app_name"},
			rows: [][]string{
				// fp1's two buckets have different plan_hash -> plan instability.
				// Both belong to transaction \xtxn1.
				{"fp1", `\xtxn1`, meta1, stats1a, "appdb", "SELECT a FROM t", "1001", "graphql"},
				{"fp1", `\xtxn1`, meta1, stats1b, "appdb", "SELECT a FROM t", "1002", "graphql"},
				{"fp2", `\xtxn2`, meta2, stats2, "appdb", "UPDATE t SET x = 1", "2001", "oban"},
			},
		},
		{
			name:   "crdb_internal.transaction_statistics.csv",
			header: []string{"fingerprint_id", "app_name", "statistics"},
			rows:   [][]string{{`\xtxn1`, "graphql", txn1}, {`\xtxn2`, "oban", txn2}},
		},
		{
			name:   "crdb_internal.transaction_contention_events.csv",
			header: []string{"database_name", "table_name", "index_name", "contention_type", "contention_duration"},
			rows: [][]string{
				{"appdb", "orders", "orders_pkey", "LOCK_WAIT", "00:00:00.5"},
				{"appdb", "users", "users_idx", "LOCK_WAIT", "00:00:01.2"},
			},
		},
		{
			name:   "crdb_internal.index_usage_statistics.csv",
			header: []string{"table_id", "index_id", "total_reads", "last_read"},
			rows: [][]string{
				{"106", "2", "0", ""},
				{"106", "3", "42", "2026-08-13 09:00:00+00"},
			},
		},
		{
			// create_statement carries the schema-qualified name in its `ON
			// <schema>.<table>` clause — the only structured source of a namespaced
			// table name in the export (there is no system.namespace CSV). The stats
			// queries extract `public.orders` from it.
			name: "crdb_internal.table_indexes.csv",
			header: []string{"descriptor_id", "descriptor_name", "index_id", "index_name",
				"index_type", "is_unique", "is_visible", "create_statement"},
			rows: [][]string{
				{"106", "orders", "2", "orders_idx", "secondary", "false", "true", "CREATE INDEX orders_idx ON public.orders (a ASC)"},
				{"106", "orders", "3", "orders_idx2", "secondary", "false", "true", "CREATE INDEX orders_idx2 ON public.orders (b ASC)"},
			},
		},
		{
			// columnIDs/histogram/partialPredicate mirror real exports (columnIDs is
			// a `{1}` / `{1,2}` VARCHAR; multi-column stats and some single-column
			// types carry no histogram). table 106 has: a newest + an older {1} stat
			// (tests the latest-per-column-set dedup), a {2} stat missing its
			// histogram, and a multi-column {1,2} stat; table 107 has a partial stat.
			name:   "system.table_statistics.csv",
			header: []string{"tableID", "name", "columnIDs", "createdAt", "rowCount", "histogram", "partialPredicate", "delayDelete"},
			rows: [][]string{
				{"106", "__auto__", "{1}", "2020-01-01 00:00:00+00", "1000", `\x0a06`, "", "false"},
				{"106", "__auto__", "{1}", "2019-01-01 00:00:00+00", "900", `\x0a06`, "", "false"},
				{"106", "__auto__", "{2}", "2020-01-01 00:00:00+00", "1000", "", "", "false"},
				{"106", "__auto__", "{1,2}", "2020-01-01 00:00:00+00", "1000", "", "", "false"},
				{"107", "__auto__", "{1}", "2020-01-01 00:00:00+00", "5000", `\x0a06`, "id > 100", ""},
			},
		},
		{
			name: "crdb_internal.cluster_settings.csv",
			header: []string{"variable", "value", "default_value", "description",
				"type", "origin", "sensitive"},
			rows: [][]string{
				{"sql.defaults.distsql", "on", "auto", "distsql mode", "e", "override", "false"},
				{"cluster.organization", "Acme", "", "org name", "s", "override", "false"},
			},
		},
		{
			name:   "crdb_internal.node_cpu_mem.csv",
			header: []string{"node_id", "address", "num_vcpus", "total_mem_gib"},
			rows:   [][]string{{"1", "10.0.0.1:26257", "8", "32.0"}, {"2", "10.0.0.2:26257", "8", "32.0"}},
		},
		{
			// System virtual cluster settings (full view). One overridden setting
			// (value != default_value) and one at default.
			name: "crdb_internal.cluster_settings.system.csv",
			header: []string{"variable", "value", "type", "public", "sensitive",
				"reportable", "description", "default_value", "origin", "key"},
			rows: [][]string{
				{"kv.snapshot_rebalance.max_rate", "64 MiB", "z", "true", "false", "true", "rebalance rate", "32 MiB", "override", "k1"},
				{"kv.range_split.by_load_enabled", "true", "b", "true", "false", "true", "split by load", "true", "default", "k2"},
			},
		},
		{
			// Persisted system.settings overrides (name/value KV form).
			name:   "system.settings.csv",
			header: []string{"name", "value", "lastUpdated", "valueType"},
			rows: [][]string{
				{"version", "23.1", "2026-08-13 13:07:55.8", "m"},
				{"sql.defaults.distsql", "on", "2026-08-13 13:07:55.8", "e"},
			},
		},
	}
}

func writeFixtures(t *testing.T) loader.ExtractedFiles {
	t.Helper()
	dir := t.TempDir()
	files := loader.ExtractedFiles{}
	for _, f := range fixtures() {
		path := filepath.Join(dir, f.name)
		fh, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		w := csv.NewWriter(fh)
		if err := w.Write(f.header); err != nil {
			t.Fatal(err)
		}
		if err := w.WriteAll(f.rows); err != nil {
			t.Fatal(err)
		}
		w.Flush()
		if err := fh.Close(); err != nil {
			t.Fatal(err)
		}
		files[f.name] = path
	}
	return files
}

// TestCatalogQueries_RunAgainstFixtureExport loads a synthetic-but-faithful
// export through the real loader and runs every catalog query. It guards against
// the whole class of "query silently breaks against a real export" regressions:
// GROUP BY / alias collisions, wrong JSON paths, and renamed columns.
func TestCatalogQueries_RunAgainstFixtureExport(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	for _, q := range catalog.All() {
		t.Run(q.ID, func(t *testing.T) {
			rows, err := db.Query(q.SQL)
			if err != nil {
				t.Fatalf("query %q failed: %v", q.ID, err)
			}
			defer rows.Close()
			cols, err := rows.Columns()
			if err != nil {
				t.Fatal(err)
			}
			for rows.Next() {
				vals := make([]any, len(cols))
				ptrs := make([]any, len(cols))
				for i := range vals {
					ptrs[i] = &vals[i]
				}
				if err := rows.Scan(ptrs...); err != nil {
					t.Fatalf("query %q scan: %v", q.ID, err)
				}
				// The API JSON-encodes each cell and the UI stringifies it. A
				// DECIMAL/INTERVAL scans into a driver struct that encodes as a
				// JSON object, rendering as "[object Object]" in the table. Assert
				// every cell serializes to a scalar (guards that class of bug).
				for i, v := range vals {
					if v == nil {
						continue
					}
					b, err := json.Marshal(v)
					if err != nil {
						t.Fatalf("query %q col %q marshal: %v", q.ID, cols[i], err)
					}
					if len(b) > 0 && (b[0] == '{' || b[0] == '[') {
						t.Errorf("query %q col %q is non-scalar (renders as [object Object]): %s",
							q.ID, cols[i], b)
					}
				}
			}
			if err := rows.Err(); err != nil {
				t.Fatalf("query %q iterate: %v", q.ID, err)
			}
		})
	}
}

// TestSlowestLatency_MaxColumnPopulated guards the runLat.max -> latencyInfo.max
// fix: the max-latency column must carry a real value, not the silent NULL that
// $.statistics.runLat.max (absent in real exports) produced.
func TestSlowestLatency_MaxColumnPopulated(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	var q catalog.Query
	for _, c := range catalog.All() {
		if c.ID == "stmt-slowest-latency" {
			q = c
		}
	}
	if q.ID == "" {
		t.Fatal("stmt-slowest-latency not found in catalog")
	}

	rows, err := db.Query(q.SQL)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	maxCol := -1
	for i, c := range cols {
		if c == "max_latency_sec" {
			maxCol = i
		}
	}
	if maxCol < 0 {
		t.Fatalf("expected a max_latency_sec column, got %v", cols)
	}

	nonNull := 0
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		if v, ok := vals[maxCol].(float64); ok && v > 0 {
			nonNull++
		}
	}
	if nonNull == 0 {
		t.Fatal("max_latency_sec was NULL/zero for every row — latencyInfo.max not read")
	}
}

// TestStatementQueries_QueryTextFromNativeColumn guards that every catalog query
// exposing a query_text column reads it from the native `query` column, not the
// sparse json_extract_string(metadata,'$.query') path. In real exports
// metadata.$.query is populated for only ~2% of rows; the fixture omits it, so a
// query still reading the JSON path returns empty query_text here.
func TestStatementQueries_QueryTextFromNativeColumn(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	for _, q := range catalog.All() {
		rows, err := db.Query(q.SQL)
		if err != nil {
			t.Fatalf("query %q failed: %v", q.ID, err)
		}
		cols, _ := rows.Columns()
		textCol := -1
		for i, c := range cols {
			if c == "query_text" {
				textCol = i
			}
		}
		if textCol < 0 {
			rows.Close()
			continue // query has no query_text column
		}
		nonEmpty, total := 0, 0
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatalf("query %q scan: %v", q.ID, err)
			}
			total++
			if s, _ := vals[textCol].(string); s != "" {
				nonEmpty++
			}
		}
		rows.Close()
		if total > 0 && nonEmpty == 0 {
			t.Errorf("query %q: query_text empty for all %d rows — still reading metadata.$.query, not the native query column",
				q.ID, total)
		}
	}
}

// TestTxnStatementBreakdown_JoinsAndPercentages guards the txn->statement
// drill-down query: it must join stmt_stats to the top transactions via the
// native transaction_fingerprint_id column, emit the statement fingerprint as a
// `fingerprint_id` column (so the drawer stays clickable), and its
// pct_of_txn_stmts must sum to ~100 within each transaction.
func TestTxnStatementBreakdown_JoinsAndPercentages(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	var q catalog.Query
	for _, c := range catalog.All() {
		if c.ID == "txn-statement-breakdown" {
			q = c
		}
	}
	if q.ID == "" {
		t.Fatal("txn-statement-breakdown not found in catalog")
	}

	rows, err := db.Query(q.SQL)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	col := func(name string) int {
		for i, c := range cols {
			if c == name {
				return i
			}
		}
		return -1
	}
	txnCol, fpCol, pctCol, textCol := col("txn_fingerprint_id"), col("fingerprint_id"), col("pct_of_txn_stmts"), col("query_text")
	for _, name := range []string{"txn_fingerprint_id", "fingerprint_id", "query_text", "stmt_executions", "mean_run_lat_sec", "total_run_sec", "pct_of_txn_stmts"} {
		if col(name) < 0 {
			t.Fatalf("expected a %q column, got %v", name, cols)
		}
	}

	pctByTxn := map[string]float64{}
	seenStmtFP := map[string]bool{}
	textNonEmpty := 0
	n := 0
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		n++
		txn, _ := vals[txnCol].(string)
		fp, _ := vals[fpCol].(string)
		seenStmtFP[fp] = true
		if s, _ := vals[textCol].(string); s != "" {
			textNonEmpty++
		}
		if p, ok := vals[pctCol].(float64); ok {
			pctByTxn[txn] += p
		}
	}
	if n == 0 {
		t.Fatal("expected at least one breakdown row, got none")
	}
	// query_text must come from the native `query` column, not metadata.$.query
	// (which is empty in the fixture, mirroring real exports).
	if textNonEmpty == 0 {
		t.Error("query_text was empty for every row — not reading the native query column")
	}
	// fingerprint_id must be the statement fp (fp1/fp2), not the txn fp.
	if seenStmtFP[`\xtxn1`] || seenStmtFP[`\xtxn2`] {
		t.Errorf("fingerprint_id column leaked a transaction fingerprint: %v", seenStmtFP)
	}
	if len(pctByTxn) == 0 {
		t.Fatal("no per-transaction percentages accumulated")
	}
	for txn, sum := range pctByTxn {
		if sum < 99.5 || sum > 100.5 {
			t.Errorf("pct_of_txn_stmts for %s summed to %.2f, want ~100", txn, sum)
		}
	}
}

// TestStatementDatabaseColumn_ReadsNativeColumn guards the database-name path.
// Newer exports set the native `database` column and leave metadata.$.db an empty
// string; a regression to json_extract_string(metadata,'$.db') yields an empty
// database column (and an empty database dropdown). Every statement/transaction
// catalog query that exposes a `database` column must resolve it to "appdb".
func TestStatementDatabaseColumn_ReadsNativeColumn(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	checked := 0
	for _, q := range catalog.All() {
		rows, err := db.Query(q.SQL)
		if err != nil {
			continue // queries against absent tables are covered elsewhere
		}
		cols, _ := rows.Columns()
		dbIdx := -1
		for i, c := range cols {
			if c == "database" {
				dbIdx = i
			}
		}
		if dbIdx < 0 {
			rows.Close()
			continue
		}
		checked++
		sawAppdb := false
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			if s, _ := vals[dbIdx].(string); s == "appdb" {
				sawAppdb = true
			} else if s == "" {
				t.Errorf("query %q returned an empty database column — not reading the native `database` column", q.ID)
			}
		}
		rows.Close()
		if !sawAppdb {
			t.Errorf("query %q never resolved database to %q", q.ID, "appdb")
		}
	}
	if checked == 0 {
		t.Fatal("no catalog query exposed a `database` column — fixture or catalog changed")
	}
}

// TestSettingsQueries_RunAndReturnRows verifies the item-10 settings queries run
// against the newly-loaded system.settings + cluster_settings.system tables and
// return the overridden (non-default) rows from the fixture.
func TestSettingsQueries_RunAndReturnRows(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	rowCount := func(id string) int {
		var q catalog.Query
		for _, c := range catalog.All() {
			if c.ID == id {
				q = c
			}
		}
		if q.ID == "" {
			t.Fatalf("%s not found in catalog", id)
		}
		rows, err := db.Query(q.SQL)
		if err != nil {
			t.Fatalf("query %q failed: %v", id, err)
		}
		defer rows.Close()
		n := 0
		for rows.Next() {
			n++
		}
		return n
	}

	// cluster_settings_system fixture has exactly one overridden (non-default) row.
	if got := rowCount("cluster-settings-system-non-default"); got != 1 {
		t.Errorf("cluster-settings-system-non-default returned %d rows, want 1", got)
	}
	// system.settings fixture has two rows.
	if got := rowCount("system-settings-overrides"); got != 2 {
		t.Errorf("system-settings-overrides returned %d rows, want 2", got)
	}
}

// TestContentionHotspots_EmptyExport reproduces the real-export bug: when the
// transaction_contention_events.csv holds only a header (no rows — common in
// real exports with no captured contention), read_csv_auto infers every column,
// including contention_duration, as VARCHAR. EXTRACT(EPOCH FROM <varchar>) then
// fails to bind ("No function matches ... date_part(STRING_LITERAL, VARCHAR)").
// The query must cast contention_duration to INTERVAL so it binds regardless of
// whether DuckDB inferred TIME (data present) or VARCHAR (empty table).
func TestContentionHotspots_EmptyExport(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Write only the contention CSV, header-only, mirroring an empty real export.
	dir := t.TempDir()
	path := filepath.Join(dir, "crdb_internal.transaction_contention_events.csv")
	fh, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	w := csv.NewWriter(fh)
	if err := w.Write([]string{"database_name", "table_name", "index_name", "contention_type", "contention_duration"}); err != nil {
		t.Fatal(err)
	}
	w.Flush()
	if err := fh.Close(); err != nil {
		t.Fatal(err)
	}
	loader.LoadCSVs(db, loader.ExtractedFiles{"crdb_internal.transaction_contention_events.csv": path}, loader.NewLoadStatus())

	// Confirm the empty table inferred contention_duration as VARCHAR (the trigger).
	var typ string
	if err := db.QueryRow("SELECT data_type FROM information_schema.columns WHERE table_name = 'txn_contention' AND column_name = 'contention_duration'").Scan(&typ); err != nil {
		t.Fatalf("could not read column type: %v", err)
	}
	if typ != "VARCHAR" {
		t.Fatalf("expected empty export to infer contention_duration as VARCHAR, got %q", typ)
	}

	var q catalog.Query
	for _, c := range catalog.All() {
		if c.ID == "txn-contention" {
			q = c
		}
	}
	if q.ID == "" {
		t.Fatal("txn-contention not found in catalog")
	}
	rows, err := db.Query(q.SQL)
	if err != nil {
		t.Fatalf("txn-contention failed to bind against a VARCHAR contention_duration: %v", err)
	}
	rows.Close()
}

// runCatalogByID runs a catalog query by id and returns its columns + a
// column-name→index map, plus the scanned rows as []any.
func runCatalogByID(t *testing.T, db *sql.DB, id string) ([]string, [][]any) {
	t.Helper()
	var q catalog.Query
	for _, c := range catalog.All() {
		if c.ID == id {
			q = c
		}
	}
	if q.ID == "" {
		t.Fatalf("%s not found in catalog", id)
	}
	rows, err := db.Query(q.SQL)
	if err != nil {
		t.Fatalf("query %q failed: %v", id, err)
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var out [][]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatalf("query %q scan: %v", id, err)
		}
		out = append(out, vals)
	}
	return cols, out
}

func colIndex(cols []string, name string) int {
	for i, c := range cols {
		if c == name {
			return i
		}
	}
	return -1
}

// TestRowsReadAmplification checks the read-amplification query ranks by
// execution-weighted rows read (the stable scan-cost metric), enforces the
// >=100 avg_rows_read floor, and keeps read_amplification as an informational
// column. In the fixture fp1 averages ~1100 rows read (kept); fp2 averages ~1
// (dropped by the floor).
func TestRowsReadAmplification(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	cols, rows := runCatalogByID(t, db, "stmt-rows-read-amplification")
	for _, name := range []string{"fingerprint_id", "query_text", "avg_rows_read", "avg_rows_returned", "read_amplification"} {
		if colIndex(cols, name) < 0 {
			t.Fatalf("expected %q column, got %v", name, cols)
		}
	}
	if len(rows) == 0 {
		t.Fatal("expected at least one amplification row")
	}
	ri := colIndex(cols, "avg_rows_read")
	// Floor: every row must average >= 100 rows read (fp2 at ~1 is excluded).
	prev := math.Inf(1)
	for _, r := range rows {
		v, _ := r[ri].(float64)
		if v < 100 {
			t.Errorf("row with avg_rows_read=%v violates the >=100 floor", v)
		}
		// Ranked by avg_rows_read DESC.
		if v > prev {
			t.Errorf("rows not ordered by avg_rows_read DESC: %v after %v", v, prev)
		}
		prev = v
	}
	// read_amplification stays present as an informational column.
	if colIndex(cols, "read_amplification") < 0 {
		t.Error("read_amplification column missing")
	}
}

// TestLatencyDecomposition checks the parse/plan/run/overhead/idle percentages
// are present and that they sum to ~100% of svcLat for a fingerprint.
func TestLatencyDecomposition(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	cols, rows := runCatalogByID(t, db, "stmt-latency-decomposition")
	want := []string{"fingerprint_id", "query_text", "mean_svc_lat_sec", "parse_pct", "plan_pct", "run_pct", "overhead_pct", "idle_pct"}
	for _, name := range want {
		if colIndex(cols, name) < 0 {
			t.Fatalf("expected %q column, got %v", name, cols)
		}
	}
	if len(rows) == 0 {
		t.Fatal("expected at least one decomposition row")
	}
	pi := []int{colIndex(cols, "parse_pct"), colIndex(cols, "plan_pct"), colIndex(cols, "run_pct"), colIndex(cols, "overhead_pct"), colIndex(cols, "idle_pct")}
	sum := 0.0
	for _, idx := range pi {
		if v, ok := rows[0][idx].(float64); ok {
			sum += v
		}
	}
	if sum < 95 || sum > 105 {
		t.Errorf("latency component percentages summed to %.1f, want ~100", sum)
	}
}

// TestTableStatsAudit checks the histogram-coverage / multi-column / partial-stat
// audit: it keeps only the latest stat per (table, column-set), classifies single-
// vs multi-column sets, computes histogram coverage over single-column sets, counts
// partial stats, and resolves the table name via table_indexes.
func TestTableStatsAudit(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	cols, rows := runCatalogByID(t, db, "stats-table-audit")
	want := []string{"table_id", "table_name", "stat_column_sets", "single_column_sets", "multi_column_sets", "single_col_with_histogram", "histogram_coverage_pct", "partial_stats", "row_count", "newest_stat_age_hours"}
	for _, name := range want {
		if colIndex(cols, name) < 0 {
			t.Fatalf("expected %q column, got %v", name, cols)
		}
	}
	if len(rows) < 2 {
		t.Fatalf("expected a row per table (>=2), got %d", len(rows))
	}

	// asInt64 tolerates int64 or float64 (DuckDB BIGINT vs coerced).
	asInt64 := func(v any) int64 {
		switch n := v.(type) {
		case int64:
			return n
		case float64:
			return int64(n)
		}
		return -1
	}
	byTable := map[int64][]any{}
	ti := colIndex(cols, "table_id")
	for _, r := range rows {
		byTable[asInt64(r[ti])] = r
	}

	r106, ok := byTable[106]
	if !ok {
		t.Fatal("no row for table_id 106")
	}
	get := func(r []any, name string) any { return r[colIndex(cols, name)] }
	// table 106: newest {1} + deduped older {1}, {2} (no histogram), {1,2} multi.
	if n := asInt64(get(r106, "stat_column_sets")); n != 3 {
		t.Errorf("106 stat_column_sets = %d, want 3 (latest-per-column-set dedup)", n)
	}
	if n := asInt64(get(r106, "single_column_sets")); n != 2 {
		t.Errorf("106 single_column_sets = %d, want 2", n)
	}
	if n := asInt64(get(r106, "multi_column_sets")); n != 1 {
		t.Errorf("106 multi_column_sets = %d, want 1", n)
	}
	if n := asInt64(get(r106, "single_col_with_histogram")); n != 1 {
		t.Errorf("106 single_col_with_histogram = %d, want 1", n)
	}
	if pct, _ := get(r106, "histogram_coverage_pct").(float64); pct != 50.0 {
		t.Errorf("106 histogram_coverage_pct = %v, want 50.0", get(r106, "histogram_coverage_pct"))
	}
	if n := asInt64(get(r106, "partial_stats")); n != 0 {
		t.Errorf("106 partial_stats = %d, want 0", n)
	}
	if name, _ := get(r106, "table_name").(string); name != "public.orders" {
		t.Errorf("106 table_name = %q, want \"public.orders\" (schema-qualified via create_statement)", name)
	}
	if n := asInt64(get(r106, "row_count")); n != 1000 {
		t.Errorf("106 row_count = %d, want 1000", n)
	}

	r107, ok := byTable[107]
	if !ok {
		t.Fatal("no row for table_id 107")
	}
	if n := asInt64(get(r107, "partial_stats")); n != 1 {
		t.Errorf("107 partial_stats = %d, want 1", n)
	}
	if pct, _ := get(r107, "histogram_coverage_pct").(float64); pct != 100.0 {
		t.Errorf("107 histogram_coverage_pct = %v, want 100.0", get(r107, "histogram_coverage_pct"))
	}
}

// TestStaleStats_TableNameResolved guards that Stale Table Statistics resolves the
// numeric descriptor id to a schema-qualified name (public.orders) via
// table_indexes.create_statement, instead of showing a bare table_id and the
// uninformative __auto__ stat name.
func TestStaleStats_TableNameResolved(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	cols, rows := runCatalogByID(t, db, "stats-stale")
	if colIndex(cols, "table_name") < 0 {
		t.Fatalf("expected a table_name column, got %v", cols)
	}
	ti, ni := colIndex(cols, "table_id"), colIndex(cols, "table_name")
	asInt64 := func(v any) int64 {
		switch n := v.(type) {
		case int64:
			return n
		case float64:
			return int64(n)
		}
		return -1
	}
	found := false
	for _, r := range rows {
		if asInt64(r[ti]) == 106 {
			found = true
			if name, _ := r[ni].(string); name != "public.orders" {
				t.Errorf("table 106 table_name = %q, want \"public.orders\"", name)
			}
		}
	}
	if !found {
		t.Fatal("table 106 (stale, createdAt 2020) not present in stale results")
	}
}

// TestLatencyPercentiles checks the p50/p90/p95/p99 query: it emits an
// "(all applications)" overall row plus one row per app_name, the percentiles are
// computed across per-fingerprint mean run latencies (so the overall row spans
// both fingerprints), and the percentiles are monotonically non-decreasing.
func TestLatencyPercentiles(t *testing.T) {
	db, err := openMemDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loader.LoadCSVs(db, writeFixtures(t), loader.NewLoadStatus())

	cols, rows := runCatalogByID(t, db, "stmt-latency-percentiles")
	want := []string{"application", "fingerprints", "total_executions", "p50_run_lat_sec", "p90_run_lat_sec", "p95_run_lat_sec", "p99_run_lat_sec"}
	for _, name := range want {
		if colIndex(cols, name) < 0 {
			t.Fatalf("expected %q column, got %v", name, cols)
		}
	}
	if len(rows) < 3 {
		t.Fatalf("expected an overall row plus one per app (>=3), got %d", len(rows))
	}

	ai := colIndex(cols, "application")
	fi := colIndex(cols, "fingerprints")
	ei := colIndex(cols, "total_executions")
	pi := []int{colIndex(cols, "p50_run_lat_sec"), colIndex(cols, "p90_run_lat_sec"), colIndex(cols, "p95_run_lat_sec"), colIndex(cols, "p99_run_lat_sec")}

	// asInt64 tolerates DuckDB returning BIGINT columns as int64 or float64.
	asInt64 := func(v any) (int64, bool) {
		switch n := v.(type) {
		case int64:
			return n, true
		case float64:
			return int64(n), true
		}
		return 0, false
	}

	var overall []any
	for _, r := range rows {
		if s, _ := r[ai].(string); s == "(all applications)" {
			overall = r
		}
	}
	if overall == nil {
		t.Fatal(`no "(all applications)" overall row found`)
	}

	// The overall row spans both fingerprints (fp1 weighted mean 0.55, fp2 0.05).
	if n, _ := asInt64(overall[fi]); n != 2 {
		t.Errorf("overall fingerprints = %v, want 2", overall[fi])
	}
	if n, _ := asInt64(overall[ei]); n != 210 {
		t.Errorf("overall total_executions = %v, want 210", overall[ei])
	}

	// Percentiles must be monotonically non-decreasing for every row.
	for _, r := range rows {
		prev := math.Inf(-1)
		for _, idx := range pi {
			v, ok := r[idx].(float64)
			if !ok {
				t.Fatalf("percentile cell %v is non-scalar/absent for app %v", r[idx], r[ai])
			}
			if v < prev {
				t.Errorf("app %v percentiles not non-decreasing: %v after %v", r[ai], v, prev)
			}
			prev = v
		}
	}
}
