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
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
)

// Store is the DuckDB handle everything else queries through. It has two
// phases:
//
//   - Loading: OpenStore creates a file-backed database (in the per-run temp
//     dir, next to the extracted CSVs) read-write, and LoadCSVs fills it.
//   - Sealed: Seal closes that handle and reopens the same file with
//     access_mode=read_only, then hardens it. From then on DuckDB itself
//     refuses every statement that would change the export (DROP, INSERT,
//     UPDATE, CREATE, ATTACH, DETACH ...), not just the ones a SQL filter
//     happened to anticipate. Reads, EXPLAIN, DESCRIBE and scratch TEMP
//     tables keep working.
//
// The export lives in a file rather than memory because DuckDB can't flip a
// running database to read-only and refuses to open an in-memory database
// read-only at all; reopen-from-file is the only way to get the engine to
// enforce it. Nothing new touches disk: the CSVs are already extracted to
// the same temp dir, which is removed on exit.
//
// Handlers hold the Store, not the *sql.DB, so the swap is invisible to
// them: Seal takes the write lock, queries take the read lock, and a request
// that arrives mid-seal simply waits for the reopen (which includes
// checkpointing the load to disk, so it can take a moment on big exports).
type Store struct {
	path   string
	mu     sync.RWMutex
	db     *sql.DB
	sealed bool
}

// OpenStore creates or opens the DuckDB database file at path read-write.
func OpenStore(path string) (*Store, error) {
	db, err := openDuckDB(path)
	if err != nil {
		return nil, err
	}
	return &Store{path: path, db: db}, nil
}

func openDuckDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("duckdb", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening duckdb: %w", err)
	}
	// One connection, on purpose. DuckDB itself allows many connections per
	// database, but the rest of the code relies on there being exactly one:
	// Seal waits for in-flight queries by acquiring it, the API's rollback
	// after a failed statement assumes the next request reuses it, and temp
	// tables and transactions from the SQL editor stay predictable instead of
	// depending on which pooled connection served the request. A single
	// query already uses every core, so this costs no throughput for a
	// single local user.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("opening duckdb: %w", err)
	}
	return db, nil
}

// Exec runs a statement on the current handle. Before Seal that is the
// read-write loading database; after it, DuckDB rejects any write.
func (s *Store) Exec(query string, args ...any) (sql.Result, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.db.Exec(query, args...)
}

// QueryContext runs a query on the current handle. The read lock is held
// only until the query has started, not while rows are consumed: Seal waits
// for in-flight rows by acquiring the single pooled connection instead.
func (s *Store) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.db.QueryContext(ctx, query, args...)
}

// Seal makes the export read-only: it closes the read-write handle (which
// checkpoints the file), reopens the file with access_mode=read_only and
// applies HardenDuckDB to the new handle. Any query that arrives meanwhile
// waits on the write lock.
//
// Queries that were already running are waited for explicitly. sql.DB.Close
// only closes idle connections; a connection whose *sql.Rows are still open
// is closed when those rows are, which would tear down (and checkpoint) the
// read-write instance after the read-only one had opened the same file. The
// pool is capped at one connection, so acquiring it here blocks until the
// in-flight query has released it, and only then is the handle closed.
// Checkpointing a large load can take seconds, during which every query
// blocks.
//
// On failure the read-write handle is already gone, so the Store is left
// unusable; the caller must treat a Seal error as fatal rather than serve
// an unsealed database.
func (s *Store) Seal() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sealed {
		return errors.New("store is already sealed")
	}
	conn, err := s.db.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("waiting for in-flight queries: %w", err)
	}
	conn.Close()
	if err := s.db.Close(); err != nil {
		return fmt.Errorf("closing read-write database: %w", err)
	}
	ro, err := openReadOnly(s.path)
	if err != nil {
		s.db = closedDB()
		return err
	}
	s.db = ro
	s.sealed = true
	return nil
}

// openReadOnly opens the database file at path with access_mode=read_only,
// verifies DuckDB really applied that mode, and hardens the handle. On any
// failure the handle is closed before the error is returned.
func openReadOnly(path string) (*sql.DB, error) {
	ro, err := openDuckDB(path + "?access_mode=read_only")
	if err != nil {
		return nil, fmt.Errorf("reopening database read-only: %w", err)
	}
	// Don't trust the DSN: go-duckdb parses it as a URL, so a '#' in the
	// path silently drops the query string and the file opens read-write.
	// Ask DuckDB which mode it actually applied.
	var mode string
	if err := ro.QueryRow("SELECT current_setting('access_mode')").Scan(&mode); err != nil {
		ro.Close()
		return nil, fmt.Errorf("checking access mode: %w", err)
	}
	if mode != "read_only" {
		ro.Close()
		return nil, fmt.Errorf("database reopened with access_mode=%q, want read_only", mode)
	}
	if err := HardenDuckDB(ro); err != nil {
		ro.Close()
		return nil, fmt.Errorf("hardening read-only database: %w", err)
	}
	return ro, nil
}

// closedDB returns a handle whose every use fails with sql's "database is
// closed" error, so a Store whose Seal failed still errors cleanly instead
// of dereferencing nil.
func closedDB() *sql.DB {
	db, _ := sql.Open("duckdb", "")
	db.Close()
	return db
}

// Close releases the underlying database.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.db.Close()
}
