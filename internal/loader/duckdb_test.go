// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package loader_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

func TestLoadCSVs_LoadsTable(t *testing.T) {
	csvPath := filepath.Join(t.TempDir(), "crdb_internal.cluster_settings.csv")
	os.WriteFile(csvPath, []byte("variable,value,default_value\nfoo,bar,baz\n"), 0o644)

	files := loader.ExtractedFiles{
		"crdb_internal.cluster_settings.csv": csvPath,
	}

	s := openStore(t)
	status := loader.NewLoadStatus()
	loader.LoadCSVs(s, files, status)

	if n := countRows(t, s, "cluster_settings"); n != 1 {
		t.Errorf("expected 1 row in cluster_settings, got %d", n)
	}
}

// LoadCSVs must NOT flip the status to ready itself: main seals the store
// (reopening it read-only and disabling external file/network access)
// between loading and SetReady, so "ready" also guarantees the SQL editor
// can neither modify the export nor touch the filesystem. If LoadCSVs marked
// ready directly, free-form SQL would be allowed during that unsealed window.
func TestLoadCSVs_ReadyOnlyAfterSetReady(t *testing.T) {
	s := openStore(t)
	status := loader.NewLoadStatus()
	loader.LoadCSVs(s, loader.ExtractedFiles{}, status)

	if status.State() != "loading" {
		t.Errorf("state after LoadCSVs = %q, want 'loading' (ready is the caller's call, after hardening)", status.State())
	}

	status.SetReady()
	if status.State() != "ready" {
		t.Errorf("state after SetReady = %q, want 'ready'", status.State())
	}
}

func TestLoadStatus_Progress(t *testing.T) {
	status := loader.NewLoadStatus()
	if status.State() != "loading" {
		t.Errorf("expected initial state 'loading', got %s", status.State())
	}
	if _, progress, _ := status.Snapshot(); progress != 0 {
		t.Errorf("expected initial progress 0, got %f", progress)
	}
}
