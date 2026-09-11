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
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
)

// fakeSpec scripts a fake database/sql driver: it yields rows, then returns
// nextErr (or io.EOF) from Next. It also records the context the handler passed
// to QueryContext. go-duckdb materializes results before returning them, so a
// real mid-stream failure can't be provoked through DuckDB; the fake makes the
// database/sql contract (Next returns false, Err reports why) testable.
type fakeSpec struct {
	cols    []string
	rows    [][]driver.Value
	nextErr error

	mu      sync.Mutex
	lastCtx context.Context
}

func (s *fakeSpec) queryCtx() context.Context {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastCtx
}

var (
	fakeSpecs        sync.Map // dsn -> *fakeSpec
	registerFakeOnce sync.Once
)

// openFake returns a *sql.DB backed by spec, keyed by the test name so
// parallel tests never collide.
func openFake(t *testing.T, spec *fakeSpec) *sql.DB {
	t.Helper()
	registerFakeOnce.Do(func() { sql.Register("fake", fakeDriver{}) })
	fakeSpecs.Store(t.Name(), spec)
	db, err := sql.Open("fake", t.Name())
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return db
}

type fakeDriver struct{}

func (fakeDriver) Open(name string) (driver.Conn, error) {
	v, ok := fakeSpecs.Load(name)
	if !ok {
		return nil, fmt.Errorf("fake driver: no spec registered for %q", name)
	}
	return &fakeConn{spec: v.(*fakeSpec)}, nil
}

type fakeConn struct{ spec *fakeSpec }

func (c *fakeConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("fake driver: Prepare not supported")
}
func (c *fakeConn) Close() error { return nil }
func (c *fakeConn) Begin() (driver.Tx, error) {
	return nil, errors.New("fake driver: Begin not supported")
}

// QueryContext makes fakeConn a driver.QueryerContext, so database/sql hands
// the caller's context straight through instead of going via Prepare.
func (c *fakeConn) QueryContext(ctx context.Context, _ string, _ []driver.NamedValue) (driver.Rows, error) {
	c.spec.mu.Lock()
	c.spec.lastCtx = ctx
	c.spec.mu.Unlock()
	return &fakeRows{spec: c.spec}, nil
}

type fakeRows struct {
	spec *fakeSpec
	i    int
}

func (r *fakeRows) Columns() []string { return r.spec.cols }
func (r *fakeRows) Close() error      { return nil }
func (r *fakeRows) Next(dst []driver.Value) error {
	if r.i < len(r.spec.rows) {
		copy(dst, r.spec.rows[r.i])
		r.i++
		return nil
	}
	if r.spec.nextErr != nil {
		return r.spec.nextErr
	}
	return io.EOF
}
