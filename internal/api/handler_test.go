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
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

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
	// The catalog is served in full: every query must carry its SQL text (the
	// web SQL editor depends on it), not just id/name/description.
	for _, q := range queries {
		if sql, ok := q["sql"].(string); !ok || sql == "" {
			t.Errorf("query %v missing sql text; want full catalog response", q["id"])
		}
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

// The README promises the SQL editor is read-only. That must hold end to end
// through /api/run against a sealed store: a DROP TABLE is refused by DuckDB
// itself, reported as a query error, and leaves the table in place.
func TestHandleRun_WritesRefusedOnSealedStore(t *testing.T) {
	store, err := loader.OpenStore(filepath.Join(t.TempDir(), "export.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if _, err := store.Exec("CREATE TABLE stmt_stats AS SELECT 'a' AS fingerprint"); err != nil {
		t.Fatal(err)
	}
	if err := store.Seal(); err != nil {
		t.Fatalf("Seal: %v", err)
	}
	status := loader.NewLoadStatus()
	status.SetReady()
	h := api.New(store, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	type runResult struct {
		Rows  [][]any `json:"rows"`
		Error string  `json:"error"`
	}
	run := func(sql string) runResult {
		t.Helper()
		req := httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"sql":`+strconv.Quote(sql)+`}`))
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		var resp runResult
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("body not JSON: %v", err)
		}
		return resp
	}

	if resp := run("DROP TABLE stmt_stats"); resp.Error == "" {
		t.Error("DROP TABLE succeeded through /api/run; the sealed store must refuse writes")
	} else if !strings.Contains(resp.Error, "read-only") {
		t.Errorf("DROP TABLE error should mention read-only, got: %s", resp.Error)
	}
	if resp := run("SELECT count(*) FROM stmt_stats"); resp.Error != "" {
		t.Errorf("SELECT after refused DROP: %s", resp.Error)
	} else if len(resp.Rows) != 1 {
		t.Errorf("SELECT after refused DROP: rows = %v, want one row", resp.Rows)
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

// A failure while iterating the result set must surface as an error, not as
// a truncated result that looks like success.
func TestHandleRun_MidStreamRowsErrorIsReported(t *testing.T) {
	spec := &fakeSpec{
		cols:    []string{"val"},
		rows:    [][]driver.Value{{int64(1)}},
		nextErr: errors.New("boom: lost the result stream"),
	}
	db := openFake(t, spec)
	status := loader.NewLoadStatus()
	status.SetReady()
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"sql":"SELECT val FROM t"}`))
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	var result map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &result); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	errMsg, _ := result["error"].(string)
	if !strings.Contains(errMsg, "boom") {
		t.Fatalf("expected the mid-stream error to be reported, got error=%q rows=%v", errMsg, result["rows"])
	}
}

func TestHandleDatabases_MidStreamRowsErrorIsReported(t *testing.T) {
	spec := &fakeSpec{
		cols:    []string{"db"},
		rows:    [][]driver.Value{{"alpha"}},
		nextErr: errors.New("boom: lost the result stream"),
	}
	db := openFake(t, spec)
	h := api.New(db, loader.NewLoadStatus(), catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("GET", "/api/databases", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500 (body %s)", rr.Code, rr.Body.String())
	}
	// A failed read must never surface the rows read so far as a result.
	if strings.Contains(rr.Body.String(), "alpha") {
		t.Errorf("partial list leaked into the error response: %s", rr.Body.String())
	}
}

type ctxKey struct{}

// Queries must run under the request context so that a client going away
// cancels the query (the DuckDB driver interrupts on ctx.Done) instead of
// tying up the single connection until it finishes.
func TestQueries_RunUnderRequestContext(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		cols   []string
	}{
		{"run", "POST", "/api/run", `{"sql":"SELECT 1"}`, []string{"val"}},
		{"databases", "GET", "/api/databases", "", []string{"db"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := &fakeSpec{cols: tc.cols}
			db := openFake(t, spec)
			status := loader.NewLoadStatus()
			status.SetReady()
			h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
			mux := http.NewServeMux()
			h.Register(mux)

			ctx := context.WithValue(context.Background(), ctxKey{}, "marker")
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)).WithContext(ctx)
			rr := httptest.NewRecorder()
			mux.ServeHTTP(rr, req)

			got := spec.queryCtx()
			if got == nil {
				t.Fatal("driver never saw a QueryContext call")
			}
			if got.Value(ctxKey{}) != "marker" {
				t.Fatalf("query ran under a context other than the request's")
			}
		})
	}
}

// End-to-end with the real driver: cancelling the request context must
// interrupt a long-running query and free the (single) connection for the
// next request.
func TestHandleRun_CanceledRequestInterruptsQuery(t *testing.T) {
	db := testDB(t)
	status := loader.NewLoadStatus()
	status.SetReady()
	h := api.New(db, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// 10^10 joined rows: far longer than the test timeout below.
	body := strings.NewReader(`{"sql":"SELECT sum(a.range * b.range) FROM range(100000) a, range(100000) b"}`)
	req := httptest.NewRequest("POST", "/api/run", body).WithContext(ctx)
	rr := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		defer close(done)
		mux.ServeHTTP(rr, req)
	}()
	// Let the query get going so we exercise interruption of a running
	// statement, not just the pre-flight ctx check. Cancelling earlier would
	// still pass; cancelling is never observed at all without the fix.
	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("handler still running 10s after the request was canceled: query was not interrupted")
	}

	var result map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &result); err != nil {
		t.Fatalf("response is not JSON: %v (body %q)", err, rr.Body.String())
	}
	if result["error"] == nil {
		t.Errorf("expected an error for the canceled query, got %v", result)
	}

	// The one connection must be free again for the next request.
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	var n int
	if err := db.QueryRowContext(ctx2, "SELECT 1").Scan(&n); err != nil {
		t.Fatalf("connection not usable after cancel: %v", err)
	}
}

// The export window is the most useful context when reading latency numbers,
// so /api/meta must surface it (the README documents it as part of the
// response). Field names follow the snake_case used by the rest of the body.
func TestHandleMeta_IncludesTimeRange(t *testing.T) {
	meta := &loader.Meta{
		ClusterVersion: "CockroachDB CCL v26.2.1",
		TimeRange:      loader.TimeRange{Start: "2026-05-28T19:00:00Z", End: "2026-05-29T18:48:00Z"},
	}
	h := api.New(testDB(t), loader.NewLoadStatus(), catalog.All(), meta, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("GET", "/api/meta", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body struct {
		TimeRange *struct {
			Start string `json:"start"`
			End   string `json:"end"`
		} `json:"time_range"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	if body.TimeRange == nil {
		t.Fatalf("time_range missing from body: %s", rr.Body.String())
	}
	if body.TimeRange.Start != "2026-05-28T19:00:00Z" || body.TimeRange.End != "2026-05-29T18:48:00Z" {
		t.Errorf("time_range = %+v, want the export window", *body.TimeRange)
	}
}

// A statement that fails inside an explicit BEGIN leaves the single DuckDB
// connection in an aborted transaction, and every later request — catalog
// queries included — fails with "Current transaction is aborted" until
// someone types ROLLBACK. On a sealed store every write is refused, so this
// is now trivial to hit by accident; the handler must recover on its own.
func TestHandleRun_RecoversFromAbortedTransaction(t *testing.T) {
	store, err := loader.OpenStore(filepath.Join(t.TempDir(), "export.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if _, err := store.Exec("CREATE TABLE stmt_stats AS SELECT 'a' AS fingerprint, 'db1' AS database"); err != nil {
		t.Fatal(err)
	}
	if err := store.Seal(); err != nil {
		t.Fatalf("Seal: %v", err)
	}
	status := loader.NewLoadStatus()
	status.SetReady()
	h := api.New(store, status, catalog.All(), &loader.Meta{}, loader.Schemas{})
	mux := http.NewServeMux()
	h.Register(mux)

	type runResult struct {
		Rows  [][]any `json:"rows"`
		Error string  `json:"error"`
	}
	run := func(sql string) runResult {
		t.Helper()
		req := httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"sql":`+strconv.Quote(sql)+`}`))
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		var resp runResult
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("body not JSON: %v", err)
		}
		return resp
	}

	for _, wedge := range []string{
		"BEGIN; DROP TABLE stmt_stats; COMMIT",
		"BEGIN; SELECT * FROM no_such_table",
	} {
		if resp := run(wedge); resp.Error == "" {
			t.Fatalf("%q succeeded; expected an error", wedge)
		}
		if resp := run("SELECT count(*) FROM stmt_stats"); resp.Error != "" {
			t.Errorf("after %q, SELECT failed: %s", wedge, resp.Error)
		} else if len(resp.Rows) != 1 {
			t.Errorf("after %q, SELECT rows = %v, want one row", wedge, resp.Rows)
		}
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, httptest.NewRequest("GET", "/api/databases", nil))
		if rr.Code != http.StatusOK || strings.TrimSpace(rr.Body.String()) != `["db1"]` {
			t.Errorf("after %q, /api/databases = %d %s, want 200 [\"db1\"]", wedge, rr.Code, rr.Body.String())
		}
	}
}
