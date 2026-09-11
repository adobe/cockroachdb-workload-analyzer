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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/api"
)

func guardedOK(t *testing.T) http.Handler {
	t.Helper()
	return api.LocalhostOnly(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

// Loopback binding doesn't stop the user's own browser: any website can fire
// no-preflight cross-origin POSTs at http://localhost:<port> (CSRF), and
// /api/run executes the SQL they carry. Browsers attach a truthful Origin to
// every cross-origin request, so a non-loopback Origin must be rejected.
func TestLocalhostOnly_RejectsCrossSiteOrigins(t *testing.T) {
	handler := guardedOK(t)

	for _, origin := range []string{
		"https://evil.example.com",
		"http://evil.example.com",
		"https://localhost.evil.example.com",
		"null",
	} {
		req := httptest.NewRequest("POST", "/api/run", nil)
		req.Host = "localhost:8080"
		req.Header.Set("Origin", origin)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Errorf("Origin %q: status = %d, want 403", origin, rr.Code)
		}
	}
}

// Same-origin requests from the served UI (Origin http://localhost:<port>),
// the Vite dev server proxy (a different loopback port), and non-browser
// clients like curl (no Origin at all) must keep working.
func TestLocalhostOnly_AllowsLoopbackOrigins(t *testing.T) {
	handler := guardedOK(t)

	for _, origin := range []string{
		"", // curl / same-origin GET: no Origin header
		"http://localhost:8080",
		"http://127.0.0.1:8123",
		"http://localhost:5173", // vite dev proxy
		"http://[::1]:8080",
	} {
		req := httptest.NewRequest("POST", "/api/run", nil)
		req.Host = "localhost:8080"
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Origin %q: status = %d, want 200", origin, rr.Code)
		}
	}
}

// DNS rebinding: an attacker's DNS name can resolve to 127.0.0.1, letting
// their page read API responses from a "same-origin" host. The browser still
// sends the attacker's hostname in Host, so a non-loopback Host must be
// rejected.
func TestLocalhostOnly_RejectsDNSRebindingHosts(t *testing.T) {
	handler := guardedOK(t)

	for _, host := range []string{
		"attacker.example.com",
		"attacker.example.com:8080",
		"192.168.1.10:8080",
	} {
		req := httptest.NewRequest("GET", "/api/status", nil)
		req.Host = host
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Errorf("Host %q: status = %d, want 403", host, rr.Code)
		}
	}
}

func TestLocalhostOnly_AllowsLoopbackHosts(t *testing.T) {
	handler := guardedOK(t)

	for _, host := range []string{
		"localhost:8080",
		"localhost",
		"127.0.0.1:8123",
		"[::1]:8080",
	} {
		req := httptest.NewRequest("GET", "/api/status", nil)
		req.Host = host
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Host %q: status = %d, want 200", host, rr.Code)
		}
	}
}
