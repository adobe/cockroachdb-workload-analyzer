// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

type Handler struct {
	db      *sql.DB
	status  *loader.LoadStatus
	queries []catalog.Query
	meta    *loader.Meta
	schemas loader.Schemas
}

func New(db *sql.DB, status *loader.LoadStatus, queries []catalog.Query, meta *loader.Meta, schemas loader.Schemas) *Handler {
	return &Handler{db: db, status: status, queries: queries, meta: meta, schemas: schemas}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/status", h.handleStatus)
	mux.HandleFunc("/api/meta", h.handleMeta)
	mux.HandleFunc("/api/queries", h.handleQueries)
	mux.HandleFunc("/api/run", h.handleRun)
	mux.HandleFunc("/api/schema", h.handleSchema)
	mux.HandleFunc("/api/databases", h.handleDatabases)
}

type statusResponse struct {
	State    string              `json:"state"`
	Progress float64             `json:"progress"`
	Tables   []loader.TableEntry `json:"tables"`
}

func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	state, progress, tables := h.status.Snapshot()
	writeJSON(w, statusResponse{State: state, Progress: progress, Tables: tables})
}

func (h *Handler) handleMeta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.meta)
}

func (h *Handler) handleQueries(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("full") == "1" {
		writeJSON(w, h.queries)
		return
	}
	type queryView struct {
		ID          string `json:"id"`
		Category    string `json:"category"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	out := make([]queryView, len(h.queries))
	for i, q := range h.queries {
		out[i] = queryView{ID: q.ID, Category: q.Category, Name: q.Name, Description: q.Description}
	}
	writeJSON(w, out)
}

func (h *Handler) handleDatabases(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT DISTINCT database AS db
		FROM stmt_stats
		WHERE database IS NOT NULL AND database <> ''
		ORDER BY db
	`)
	if err != nil {
		log.Printf("handleDatabases: query failed: %v", err)
		writeJSON(w, []string{})
		return
	}
	defer rows.Close()
	var dbs []string
	for rows.Next() {
		var db string
		if err := rows.Scan(&db); err == nil {
			dbs = append(dbs, db)
		}
	}
	if dbs == nil {
		dbs = []string{}
	}
	writeJSON(w, dbs)
}

type runRequest struct {
	SQL     string `json:"sql"`
	QueryID string `json:"query_id"`
	DB      string `json:"db"`
}

type runResponse struct {
	Columns    []string `json:"columns"`
	Rows       [][]any  `json:"rows"`
	DurationMs int64    `json:"duration_ms"`
	Error      string   `json:"error,omitempty"`
}

func (h *Handler) handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req runRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	var finalSQL string
	var args []any

	if req.QueryID != "" {
		var found *catalog.Query
		for i := range h.queries {
			if h.queries[i].ID == req.QueryID {
				found = &h.queries[i]
				break
			}
		}
		if found == nil {
			writeJSON(w, runResponse{Error: "unknown query_id: " + req.QueryID})
			return
		}
		finalSQL, args = BuildFilteredSQL(*found, req.DB)
	} else {
		// Free-form SQL waits for "ready": main hardens DuckDB (the one-way
		// disable of external file/network access) only after loading, so
		// running user-supplied SQL earlier would let a request read arbitrary
		// local files via read_csv_auto(). Catalog queries above are fixed SQL
		// from the embedded catalog and don't need the gate.
		if h.status.State() != "ready" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			writeJSON(w, runResponse{Error: "The export is still loading — the SQL editor is available once loading completes."})
			return
		}
		finalSQL = req.SQL
	}

	start := time.Now()
	rows, err := h.db.Query(finalSQL, args...)
	if err != nil {
		writeJSON(w, runResponse{Error: friendlyRunError(err, h.status)})
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		writeJSON(w, runResponse{Error: err.Error()})
		return
	}

	// A nil slice marshals to JSON null; use an empty slice so the client always
	// receives an array (the UI does result.rows.length with no null guard).
	result := [][]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			writeJSON(w, runResponse{Error: err.Error()})
			return
		}
		row := make([]any, len(vals))
		copy(row, vals)
		result = append(result, row)
	}

	writeJSON(w, runResponse{
		Columns:    cols,
		Rows:       result,
		DurationMs: time.Since(start).Milliseconds(),
	})
}

// missingTableRe matches DuckDB's catalog error for a table that doesn't exist.
var missingTableRe = regexp.MustCompile(`Table with name (\S+) does not exist`)

// friendlyRunError turns a low-level DuckDB error into guidance the UI can show.
// The common case is a query against a table this export didn't include — e.g.
// node_cpu_mem / gossip_nodes are absent from application-virtual-cluster
// exports — so surface that plainly instead of a raw "Catalog Error".
func friendlyRunError(err error, status *loader.LoadStatus) string {
	msg := err.Error()
	m := missingTableRe.FindStringSubmatch(msg)
	if m == nil {
		return msg
	}
	name := m[1]
	if tableAbsentFromExport(status, name) {
		return fmt.Sprintf("The %q table isn't in this export, so this query can't run. "+
			"Some workload exports (e.g. from an application virtual cluster) omit node and gossip tables.", name)
	}
	return fmt.Sprintf("Table %q does not exist — it may be missing from this export, or check the spelling.", name)
}

// tableAbsentFromExport reports whether name is a table the loader tried to load
// for this export but couldn't (missing CSV or a load error).
func tableAbsentFromExport(status *loader.LoadStatus, name string) bool {
	if status == nil {
		return false
	}
	_, _, tables := status.Snapshot()
	for _, t := range tables {
		if t.Name == name {
			return !t.Loaded
		}
	}
	return false
}

// BuildFilteredSQL returns SQL and args for a catalog query with optional database filter.
// When q.DBFilterExpr is empty or db is empty, the original SQL is returned unchanged.
func BuildFilteredSQL(q catalog.Query, db string) (string, []any) {
	if q.DBFilterExpr == "" || db == "" {
		return q.SQL, nil
	}
	condition := q.DBFilterExpr + " = ?"
	sql := q.SQL
	if strings.Contains(sql, "WHERE") {
		sql = injectAfterWhere(sql, "AND "+condition)
	} else {
		sql = injectWhereClause(sql, "WHERE "+condition)
	}
	return sql, []any{db}
}

// injectAfterWhere inserts condition before the first of GROUP BY/HAVING/ORDER BY/LIMIT.
func injectAfterWhere(sql, condition string) string {
	insertAt := firstKeyword(sql, []string{"GROUP BY", "HAVING", "ORDER BY", "LIMIT"})
	return sql[:insertAt] + "  " + condition + "\n" + sql[insertAt:]
}

// injectWhereClause inserts clause before the first of GROUP BY/HAVING/ORDER BY/LIMIT.
func injectWhereClause(sql, clause string) string {
	insertAt := firstKeyword(sql, []string{"GROUP BY", "HAVING", "ORDER BY", "LIMIT"})
	return sql[:insertAt] + clause + "\n" + sql[insertAt:]
}

func firstKeyword(sql string, keywords []string) int {
	insertAt := len(sql)
	for _, kw := range keywords {
		if idx := strings.Index(sql, kw); idx >= 0 && idx < insertAt {
			insertAt = idx
		}
	}
	return insertAt
}

type schemaResponse struct {
	Databases map[string]string `json:"databases"`
}

func (h *Handler) handleSchema(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, schemaResponse{Databases: h.schemas})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
