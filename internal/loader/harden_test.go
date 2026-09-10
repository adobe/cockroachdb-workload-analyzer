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

import "testing"

// After the export is loaded, HardenDuckDB must block arbitrary local file
// access from SQL (read_csv/COPY/ATTACH) while leaving in-memory queries working.
func TestHardenDuckDB_BlocksExternalFileAccess(t *testing.T) {
	db, err := OpenDuckDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
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
