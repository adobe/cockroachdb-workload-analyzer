// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package api_test

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/api"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
	_ "github.com/marcboeker/go-duckdb"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("duckdb", "")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return db
}

func TestHandleStatus_ReturnsJSON(t *testing.T) {
	status := loader.NewLoadStatus()
	h := api.New(testDB(t), status, catalog.All(), &loader.Meta{}, loader.Schemas{})

	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("GET", "/api/status", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Errorf("body not JSON: %v", err)
	}
	if body["state"] != "loading" {
		t.Errorf("state = %v, want 'loading'", body["state"])
	}
}

func TestHandleQueries_ReturnsAll(t *testing.T) {
	status := loader.NewLoadStatus()
	h := api.New(testDB(t), status, catalog.All(), &loader.Meta{}, loader.Schemas{})

	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("GET", "/api/queries", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var queries []map[string]any
	json.Unmarshal(rr.Body.Bytes(), &queries)
	if want := len(catalog.All()); len(queries) != want {
		t.Errorf("expected %d queries, got %d", want, len(queries))
	}
}

func TestHandleRun_ExecutesSQL(t *testing.T) {
	db := testDB(t)
	db.Exec("CREATE TABLE test_tbl AS SELECT 42 AS val")

	status := loader.NewLoadStatus()
	status.SetReady() // free-form SQL is gated until loading completes
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})

	mux := http.NewServeMux()
	h.Register(mux)

	body := strings.NewReader(`{"sql":"SELECT val FROM test_tbl"}`)
	req := httptest.NewRequest("POST", "/api/run", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var result map[string]any
	json.Unmarshal(rr.Body.Bytes(), &result)
	if result["error"] != nil {
		t.Errorf("unexpected error: %v", result["error"])
	}
	rows, _ := result["rows"].([]any)
	if len(rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(rows))
	}
}

// Free-form SQL must be refused until loading completes: main hardens DuckDB
// (the one-way disable of external file/network access) only after LoadCSVs
// finishes, so during loading a cross-site request could still read arbitrary
// local files via read_csv_auto(). "ready" means "loaded AND hardened" — only
// then may user-supplied SQL reach the database.
func TestHandleRun_FreeFormSQLRefusedWhileLoading(t *testing.T) {
	db := testDB(t)
	db.Exec("CREATE TABLE test_tbl AS SELECT 42 AS val")

	status := loader.NewLoadStatus() // still "loading"
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"sql":"SELECT val FROM test_tbl"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503 while loading", rr.Code)
	}
	var result map[string]any
	json.Unmarshal(rr.Body.Bytes(), &result)
	errMsg, _ := result["error"].(string)
	if !strings.Contains(errMsg, "loading") {
		t.Errorf("error = %q, want a message explaining the export is still loading", errMsg)
	}
	if result["rows"] != nil {
		t.Errorf("rows = %v, want none — the SQL must not execute", result["rows"])
	}

	// The identical request succeeds once loading (and hardening) completed.
	status.SetReady()
	req = httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"sql":"SELECT val FROM test_tbl"}`))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status after ready = %d, want 200", rr.Code)
	}
	result = nil
	json.Unmarshal(rr.Body.Bytes(), &result)
	if result["error"] != nil {
		t.Errorf("unexpected error after ready: %v", result["error"])
	}
	if rows, _ := result["rows"].([]any); len(rows) != 1 {
		t.Errorf("expected 1 row after ready, got %v", result["rows"])
	}
}

// Catalog queries are fixed SQL from the embedded catalog — safe by
// construction — so they stay available while loading (the UI polls status
// but must not be locked out of predefined queries by the free-form gate).
func TestHandleRun_CatalogQueryNotGatedWhileLoading(t *testing.T) {
	db := testDB(t)
	h := api.New(db, loader.NewLoadStatus(), catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	queryID := catalog.All()[0].ID
	req := httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"query_id":"`+queryID+`"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code == http.StatusServiceUnavailable {
		t.Errorf("catalog query %s was refused by the loading gate; only free-form SQL should be", queryID)
	}
}

func TestHandleRun_ZeroRowsReturnsEmptyArray(t *testing.T) {
	db := testDB(t)
	db.Exec("CREATE TABLE test_tbl AS SELECT 42 AS val")

	status := loader.NewLoadStatus()
	status.SetReady() // free-form SQL is gated until loading completes
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	body := strings.NewReader(`{"sql":"SELECT val FROM test_tbl WHERE val = 0"}`)
	req := httptest.NewRequest("POST", "/api/run", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	// rows must serialize as [] (not null): the UI reads rows.length with no
	// null guard, so null crashes it (e.g. the fingerprint drawer's lookups).
	if strings.Contains(rr.Body.String(), `"rows":null`) {
		t.Errorf("zero-row result returned null rows: %s", rr.Body.String())
	}
	var result struct {
		Rows *[][]any `json:"rows"`
	}
	json.Unmarshal(rr.Body.Bytes(), &result)
	if result.Rows == nil {
		t.Fatal("rows was null, want empty array")
	}
	if len(*result.Rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(*result.Rows))
	}
}

func TestHandleRun_MissingTableIsFriendly(t *testing.T) {
	db := testDB(t)
	// Empty export: LoadCSVs creates no tables and records every known table as
	// "not in export" — mirrors an application-VC export that omits node_cpu_mem.
	status := loader.NewLoadStatus()
	loader.LoadCSVs(db, loader.ExtractedFiles{}, status)
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	body := strings.NewReader(`{"query_id":"cluster-node-cpu"}`) // SELECT ... FROM node_cpu_mem
	req := httptest.NewRequest("POST", "/api/run", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var result struct {
		Error string `json:"error"`
	}
	json.Unmarshal(rr.Body.Bytes(), &result)
	if !strings.Contains(result.Error, "node_cpu_mem") {
		t.Fatalf("error should name the missing table, got %q", result.Error)
	}
	if !strings.Contains(result.Error, "export") {
		t.Errorf("error should explain the table is not in this export, got %q", result.Error)
	}
	if strings.Contains(result.Error, "Catalog Error") {
		t.Errorf("raw DuckDB error leaked to the client: %q", result.Error)
	}
}

func TestHandleRun_ReturnsErrorOnBadSQL(t *testing.T) {
	status := loader.NewLoadStatus()
	status.SetReady() // free-form SQL is gated until loading completes
	h := api.New(testDB(t), status, catalog.All(), &loader.Meta{}, loader.Schemas{})

	mux := http.NewServeMux()
	h.Register(mux)

	body := strings.NewReader(`{"sql":"SELECT * FROM nonexistent_table_xyz"}`)
	req := httptest.NewRequest("POST", "/api/run", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 (errors returned in body)", rr.Code)
	}
	var result map[string]any
	json.Unmarshal(rr.Body.Bytes(), &result)
	if result["error"] == nil {
		t.Error("expected error field for bad SQL")
	}
}

func TestBuildFilteredSQL_InjectsANDWhenWhereExists(t *testing.T) {
	q := catalog.Query{
		ID:           "stmt-top-cpu",
		DBFilterExpr: "json_extract_string(metadata, '$.db')",
		SQL: `SELECT fingerprint_id
FROM stmt_stats
WHERE json_extract(statistics, '$.x') IS NOT NULL
GROUP BY fingerprint_id
ORDER BY cnt DESC
LIMIT 25`,
	}
	sql, args := api.BuildFilteredSQL(q, "mydb")
	if !strings.Contains(sql, "AND json_extract_string(metadata, '$.db') = ?") {
		t.Errorf("expected AND condition in SQL, got:\n%s", sql)
	}
	if len(args) != 1 || args[0] != "mydb" {
		t.Errorf("expected args=[mydb], got %v", args)
	}
}

func TestBuildFilteredSQL_InjectsWhereWhenNone(t *testing.T) {
	q := catalog.Query{
		ID:           "stmt-slowest-latency",
		DBFilterExpr: "database",
		SQL: `SELECT fingerprint_id
FROM stmt_stats
GROUP BY fingerprint_id
ORDER BY cnt DESC
LIMIT 25`,
	}
	sql, args := api.BuildFilteredSQL(q, "mydb")
	if !strings.Contains(sql, "WHERE database = ?") {
		t.Errorf("expected WHERE clause in SQL, got:\n%s", sql)
	}
	if len(args) != 1 || args[0] != "mydb" {
		t.Errorf("expected args=[mydb], got %v", args)
	}
}

func TestBuildFilteredSQL_EmptyExpr_ReturnsOriginal(t *testing.T) {
	q := catalog.Query{
		ID:  "idx-unused",
		SQL: `SELECT * FROM idx_usage`,
	}
	sql, args := api.BuildFilteredSQL(q, "mydb")
	if sql != q.SQL {
		t.Errorf("SQL should be unchanged, got:\n%s", sql)
	}
	if args != nil {
		t.Errorf("args should be nil, got: %v", args)
	}
}

func TestBuildFilteredSQL_EmptyDB_ReturnsOriginal(t *testing.T) {
	q := catalog.Query{
		ID:           "stmt-top-cpu",
		DBFilterExpr: "database",
		SQL:          `SELECT fingerprint_id FROM stmt_stats GROUP BY fingerprint_id`,
	}
	sql, args := api.BuildFilteredSQL(q, "")
	if sql != q.SQL {
		t.Errorf("SQL should be unchanged when db empty, got:\n%s", sql)
	}
	if args != nil {
		t.Errorf("args should be nil, got: %v", args)
	}
}

func TestHandleDatabases_ReturnsDistinctDbs(t *testing.T) {
	db := testDB(t)
	// Newer exports carry a native `database` column; metadata.$.db is an empty
	// string. The dropdown must read the native column, skipping blanks.
	db.Exec(`CREATE TABLE stmt_stats (metadata VARCHAR, database VARCHAR)`)
	db.Exec(`INSERT INTO stmt_stats VALUES
		('{"db":""}', 'alpha'),
		('{"db":""}', 'beta'),
		('{"db":""}', 'alpha'),
		('{}', '')`)

	status := loader.NewLoadStatus()
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("GET", "/api/databases", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var dbs []string
	json.Unmarshal(rr.Body.Bytes(), &dbs)
	if len(dbs) != 2 {
		t.Errorf("expected 2 databases, got %d: %v", len(dbs), dbs)
	}
	if len(dbs) == 2 && (dbs[0] != "alpha" || dbs[1] != "beta") {
		t.Errorf("expected [alpha beta], got %v", dbs)
	}
}

func TestHandleRun_WithQueryID_ExecutesCatalogQuery(t *testing.T) {
	db := testDB(t)
	db.Exec(`CREATE TABLE node_cpu_mem (node_id INT, address VARCHAR, num_vcpus VARCHAR, total_mem_gib VARCHAR)`)
	db.Exec(`INSERT INTO node_cpu_mem VALUES (1, 'localhost:26257', '4', '16.0')`)

	status := loader.NewLoadStatus()
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	body := strings.NewReader(`{"query_id":"cluster-node-cpu","db":""}`)
	req := httptest.NewRequest("POST", "/api/run", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var result map[string]any
	json.Unmarshal(rr.Body.Bytes(), &result)
	if result["error"] != nil && result["error"] != "" {
		t.Errorf("unexpected error: %v", result["error"])
	}
	rows, _ := result["rows"].([]any)
	if len(rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(rows))
	}
}

func TestHandleRun_WithQueryID_UnknownID(t *testing.T) {
	status := loader.NewLoadStatus()
	h := api.New(testDB(t), status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	body := strings.NewReader(`{"query_id":"nonexistent-query","db":""}`)
	req := httptest.NewRequest("POST", "/api/run", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var result map[string]any
	json.Unmarshal(rr.Body.Bytes(), &result)
	if result["error"] == nil {
		t.Error("expected error field for unknown query_id")
	}
}
