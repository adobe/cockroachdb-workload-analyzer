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
	"testing"
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
