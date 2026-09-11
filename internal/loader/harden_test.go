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
	"testing"
)

// memDB opens a throwaway in-memory DuckDB. Production uses a file-backed
// Store (see store.go); these tests only exercise the settings HardenDuckDB
// applies, which behave the same either way.
func memDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("duckdb", "")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return db
}

// After the export is loaded, HardenDuckDB must block arbitrary local file
// access from SQL (read_csv/COPY/ATTACH) while leaving in-memory queries working.
func TestHardenDuckDB_BlocksExternalFileAccess(t *testing.T) {
	db := memDB(t)
	if _, err := db.Exec("CREATE TABLE t AS SELECT 1 AS a"); err != nil {
		t.Fatal(err)
	}

	if err := HardenDuckDB(db); err != nil {
		t.Fatalf("harden: %v", err)
	}

	// In-memory queries must still work.
	var n int
	if err := db.QueryRow("SELECT count(*) FROM t").Scan(&n); err != nil || n != 1 {
		t.Fatalf("in-memory query broke after harden: n=%d err=%v", n, err)
	}

	// Arbitrary file reads via SQL must now be rejected.
	if _, err := db.Exec("SELECT * FROM read_csv_auto('/etc/hostname')"); err == nil {
		t.Error("read_csv should be blocked after HardenDuckDB, but it succeeded")
	}
}

// Everything the readiness gate relies on: a SQL-tab user must not be able to
// undo the hardening or change any other setting once it is in place. Each of
// these is pinned so a DuckDB upgrade that relaxes the behavior fails loudly.
func TestHardenDuckDB_IsOneWayAndLocksConfiguration(t *testing.T) {
	db := memDB(t)
	if err := HardenDuckDB(db); err != nil {
		t.Fatalf("harden: %v", err)
	}

	mustFail := []struct{ name, sql string }{
		{"re-enable external access", "SET enable_external_access=true"},
		{"re-enable external access (RESET)", "RESET enable_external_access"},
		{"re-enable external access (GLOBAL)", "SET GLOBAL enable_external_access=true"},
		{"install extension", "INSTALL httpfs"},
		{"load extension", "LOAD httpfs"},
		{"copy to file", "COPY (SELECT 1) TO '/tmp/harden_test_copy.csv'"},
		{"attach database", "ATTACH '/tmp/harden_test_attach.duckdb'"},
		// lock_configuration: no setting may change after hardening, including
		// ones that steer where DuckDB writes (temp spill, home directory).
		{"change temp_directory", "SET temp_directory='/tmp'"},
		{"change home_directory", "SET home_directory='/tmp'"},
		{"enable autoinstall", "SET autoinstall_known_extensions=true"},
		{"unlock configuration", "SET lock_configuration=false"},
	}
	for _, tc := range mustFail {
		if _, err := db.Exec(tc.sql); err == nil {
			t.Errorf("%s: %q succeeded after HardenDuckDB; want error", tc.name, tc.sql)
		}
	}

	// And the original restriction must still hold after all those attempts.
	if _, err := db.Exec("SELECT * FROM read_csv_auto('/etc/hostname')"); err == nil {
		t.Error("read_csv succeeded after attempted re-enable; hardening is not one-way")
	}
}
