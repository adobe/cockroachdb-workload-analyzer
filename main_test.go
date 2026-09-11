// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package main

import (
	"net"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/api"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

// The HTTP server must bind to loopback only. Binding to all interfaces would
// expose /api/run (which executes arbitrary DuckDB SQL) to the local network.
func TestListenWithFallback_BindsLoopback(t *testing.T) {
	ln, err := listenWithFallback(0)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	addr, ok := ln.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener addr is not TCP: %v", ln.Addr())
	}
	if !addr.IP.IsLoopback() {
		t.Errorf("server bound to %s; want loopback (must not be network-reachable)", addr.IP)
	}
}

// The localhost-only guard must wrap the handler the server actually serves —
// a guard that exists but isn't wired protects nothing. Loopback binding
// alone doesn't stop the user's own browser from delivering cross-site
// requests to /api/run.
func TestNewServerHandler_GuardsAgainstCrossSiteRequests(t *testing.T) {
	store, err := loader.OpenStore(filepath.Join(t.TempDir(), "export.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	h := api.New(store, loader.NewLoadStatus(), catalog.All(), &loader.Meta{}, loader.Schemas{})
	handler := newServerHandler(h)

	// A hostile page's CSRF POST carries its own Origin.
	req := httptest.NewRequest("POST", "/api/run", strings.NewReader(`{"sql":"SELECT 1"}`))
	req.Host = "localhost:8080"
	req.Header.Set("Origin", "https://evil.example.com")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 403 {
		t.Errorf("cross-origin POST /api/run: status = %d, want 403", rr.Code)
	}

	// DNS rebinding presents a non-loopback Host; static files are guarded too.
	req = httptest.NewRequest("GET", "/", nil)
	req.Host = "attacker.example.com"
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 403 {
		t.Errorf("rebound-host GET /: status = %d, want 403", rr.Code)
	}

	// The legitimate UI keeps working.
	req = httptest.NewRequest("GET", "/api/status", nil)
	req.Host = "localhost:8080"
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("same-origin GET /api/status: status = %d, want 200", rr.Code)
	}
}
