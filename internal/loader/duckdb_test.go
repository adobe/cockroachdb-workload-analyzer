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

func TestOpenDuckDB_InMemory(t *testing.T) {
	db, err := loader.OpenDuckDB()
	if err != nil {
		t.Fatalf("OpenDuckDB: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Errorf("Ping: %v", err)
	}
}

func TestLoadCSVs_LoadsTable(t *testing.T) {
	csvPath := filepath.Join(t.TempDir(), "crdb_internal.cluster_settings.csv")
	os.WriteFile(csvPath, []byte("variable,value,default_value\nfoo,bar,baz\n"), 0o644)

	files := loader.ExtractedFiles{
		"crdb_internal.cluster_settings.csv": csvPath,
	}

	db, _ := loader.OpenDuckDB()
	defer db.Close()

	status := loader.NewLoadStatus()
	loader.LoadCSVs(db, files, status)

	var count int
	db.QueryRow("SELECT COUNT(*) FROM cluster_settings").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 row in cluster_settings, got %d", count)
	}
}

func TestLoadStatus_Progress(t *testing.T) {
	status := loader.NewLoadStatus()
	if status.State() != "loading" {
		t.Errorf("expected initial state 'loading', got %s", status.State())
	}
	if status.Progress() != 0 {
		t.Errorf("expected initial progress 0, got %f", status.Progress())
	}
}
