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
	"net"
	"net/http"
	"net/url"
	"strings"
)

// LocalhostOnly rejects requests that a hostile web page could have induced
// the user's browser to send. Binding the listener to loopback keeps the
// local network out, but not the user's own browser: any website can fire
// no-preflight cross-origin requests at http://localhost:<port> (CSRF), and
// DNS rebinding can point an attacker-controlled hostname at 127.0.0.1 so
// their page can read responses as "same-origin". Two checks close both:
//
//   - Origin, when present, must be a loopback origin. Browsers attach a
//     truthful Origin to every cross-origin request (and every POST), so a
//     hostile page always identifies itself. Requests without an Origin —
//     same-origin GETs, curl — pass.
//   - Host must be a loopback name, so a rebound DNS name is refused even
//     though the TCP connection arrives on 127.0.0.1.
//
// Any loopback port is accepted, not just this server's: the Vite dev server
// proxies /api from another port, and other local processes can reach the
// API directly regardless of browser rules.
func LocalhostOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackHostport(r.Host) {
			http.Error(w, "forbidden: server only accepts requests addressed to localhost", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || !isLoopbackHostport(u.Host) {
				http.Error(w, "forbidden: cross-site requests are not allowed", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// isLoopbackHostport reports whether hostport ("localhost", "127.0.0.1:8080",
// "[::1]:5173", ...) names the loopback interface.
func isLoopbackHostport(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
