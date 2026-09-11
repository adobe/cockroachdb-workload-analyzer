// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package loader_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

func openStore(t *testing.T) *loader.Store {
	t.Helper()
	s, err := loader.OpenStore(filepath.Join(t.TempDir(), "export.duckdb"))
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func countRows(t *testing.T, s *loader.Store, table string) int {
	t.Helper()
	rows, err := s.QueryContext(context.Background(), "SELECT count(*) FROM "+table)
	if err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	defer rows.Close()
	var n int
	if !rows.Next() {
		t.Fatalf("count %s: no row", table)
	}
	if err := rows.Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// Before Seal the store is a normal read-write database: the loader creates
// and patches tables through it.
func TestStore_ReadWriteBeforeSeal(t *testing.T) {
	s := openStore(t)
	if _, err := s.Exec("CREATE TABLE t AS SELECT 1 AS a"); err != nil {
		t.Fatalf("create before seal: %v", err)
	}
	if _, err := s.Exec("UPDATE t SET a = 2"); err != nil {
		t.Fatalf("update before seal: %v", err)
	}
	if n := countRows(t, s, "t"); n != 1 {
		t.Errorf("count = %d, want 1", n)
	}
}

// The README promises the SQL editor is read-only. Seal must make DuckDB
// itself enforce that: after it, every statement that would change the
// loaded export is refused by the engine, while reads keep working through
// the same handle the API holds. Scratch temp tables stay allowed — they
// live outside the export and vanish with the session.
func TestStore_SealMakesExportReadOnly(t *testing.T) {
	s := openStore(t)
	if _, err := s.Exec("CREATE TABLE t AS SELECT 1 AS a"); err != nil {
		t.Fatal(err)
	}
	if err := s.Seal(); err != nil {
		t.Fatalf("Seal: %v", err)
	}

	if n := countRows(t, s, "t"); n != 1 {
		t.Errorf("data did not survive the read-only reopen: count = %d, want 1", n)
	}

	// Writes must be refused with an error that tells the user why.
	mustFailReadOnly := []struct{ name, sql string }{
		{"drop table", "DROP TABLE t"},
		{"insert", "INSERT INTO t VALUES (2)"},
		{"update", "UPDATE t SET a = 3"},
		{"delete", "DELETE FROM t"},
		{"alter", "ALTER TABLE t ADD COLUMN b INT"},
		{"create table", "CREATE TABLE u AS SELECT 1"},
		{"create view", "CREATE VIEW v AS SELECT 1"},
		{"multi-statement", "SELECT 1; DROP TABLE t"},
		{"attach scratch database", "ATTACH ':memory:' AS scratch"},
	}
	for _, tc := range mustFailReadOnly {
		_, err := s.Exec(tc.sql)
		if err == nil {
			t.Errorf("%s: %q succeeded after Seal; want read-only error", tc.name, tc.sql)
			continue
		}
		if !strings.Contains(err.Error(), "read-only") {
			t.Errorf("%s: error should say the database is read-only, got: %v", tc.name, err)
		}
	}
	// The export can't be detached out from under the catalog queries either
	// (DuckDB refuses because it is the default database).
	if _, err := s.Exec("DETACH export"); err == nil {
		t.Error("DETACH export succeeded after Seal; want error")
	}

	if n := countRows(t, s, "t"); n != 1 {
		t.Errorf("export changed despite Seal: count = %d, want 1", n)
	}

	// Scratch temp tables are fine: they aren't part of the export.
	if _, err := s.Exec("CREATE TEMP TABLE scratch AS SELECT 1 AS a"); err != nil {
		t.Errorf("temp table after Seal: %v (scratch tables should stay allowed)", err)
	}
}

// Seal replaces the underlying database handle; the hardening (no external
// file/network access, locked configuration) has to be applied to the new
// handle, or reopening would silently undo it.
func TestStore_SealHardensReopenedDatabase(t *testing.T) {
	s := openStore(t)
	if err := s.Seal(); err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if _, err := s.QueryContext(context.Background(), "SELECT * FROM read_csv_auto('/etc/hostname')"); err == nil {
		t.Error("read_csv succeeded after Seal; external access must be disabled on the reopened database")
	}
	if _, err := s.Exec("SET enable_external_access=true"); err == nil {
		t.Error("SET succeeded after Seal; configuration must be locked on the reopened database")
	}
}

// A second Seal is refused and leaves the sealed store untouched.
func TestStore_SealTwiceFails(t *testing.T) {
	s := openStore(t)
	if err := s.Seal(); err != nil {
		t.Fatalf("first Seal: %v", err)
	}
	if err := s.Seal(); err == nil {
		t.Error("second Seal succeeded; want error (already sealed)")
	}
	if n := countRows(t, s, "(SELECT 1) sub"); n != 1 {
		t.Errorf("store unusable after failed second Seal: %d", n)
	}
}

// Seal swaps the underlying handle while catalog queries may still be in
// flight (the UI polls during loading). sql.DB.Close only closes idle
// connections, so unless Seal explicitly waits for the busy one, the
// read-write instance is torn down — and checkpoints the file — after the
// read-only instance has already opened it. Seal must block until the
// in-flight rows are closed.
func TestStore_SealWaitsForInFlightQuery(t *testing.T) {
	s := openStore(t)
	if _, err := s.Exec("CREATE TABLE t AS SELECT range AS a FROM range(1000)"); err != nil {
		t.Fatal(err)
	}
	rows, err := s.QueryContext(context.Background(), "SELECT a FROM t")
	if err != nil {
		t.Fatal(err)
	}
	if !rows.Next() {
		t.Fatal("no rows")
	}

	sealed := make(chan error, 1)
	go func() { sealed <- s.Seal() }()

	select {
	case err := <-sealed:
		t.Fatalf("Seal returned (%v) while rows were still open; it must wait for in-flight queries", err)
	case <-time.After(300 * time.Millisecond):
	}

	rows.Close()
	select {
	case err := <-sealed:
		if err != nil {
			t.Fatalf("Seal after rows closed: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Seal did not return after the in-flight rows were closed")
	}

	if n := countRows(t, s, "t"); n != 1000 {
		t.Errorf("count after Seal = %d, want 1000", n)
	}
	if _, err := s.Exec("DROP TABLE t"); err == nil {
		t.Error("DROP TABLE succeeded after Seal")
	}
}

// Seal on a store whose read-only reopen fails must leave a usable error,
// not a nil handle: main treats any Seal error as fatal, but a query that
// races it must fail cleanly rather than panic.
func TestStore_SealReopenFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "export.duckdb")
	s, err := loader.OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.Exec("CREATE TABLE t AS SELECT 1 AS a"); err != nil {
		t.Fatal(err)
	}
	// Pull the file out from under the store so the read-only reopen fails.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := s.Seal(); err == nil {
		t.Fatal("Seal succeeded with the database file removed")
	}
	if _, err := s.QueryContext(context.Background(), "SELECT 1"); err == nil {
		t.Error("query succeeded on a store whose Seal failed; want an error")
	}
	if err := s.Close(); err != nil {
		t.Errorf("Close after failed Seal: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Errorf("second Close after failed Seal: %v", err)
	}
}

// go-duckdb parses the DSN as a URL, so a '#' in the database path turns
// "?access_mode=read_only" into a fragment and silently drops it. Seal must
// verify the mode DuckDB actually applied rather than trust the DSN, or a
// temp dir with a '#' in its name would leave the export writable while
// reporting it sealed.
func TestStore_SealVerifiesReadOnlyMode(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "run#1")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	s, err := loader.OpenStore(filepath.Join(dir, "export.duckdb"))
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.Exec("CREATE TABLE t AS SELECT 1 AS a"); err != nil {
		t.Fatal(err)
	}
	err = s.Seal()
	if err == nil {
		// If go-duckdb ever handles '#' correctly this branch is fine, but
		// then the store really must be read-only.
		if _, err := s.Exec("DROP TABLE t"); err == nil {
			t.Fatal("Seal reported success but DROP TABLE succeeded: store is not read-only")
		}
		return
	}
	if !strings.Contains(err.Error(), "read_only") {
		t.Errorf("Seal error should say the mode was not read_only, got: %v", err)
	}
	if _, err := s.Exec("DROP TABLE t"); err == nil {
		t.Error("DROP TABLE succeeded after a failed Seal; the store must not stay writable")
	}
}
