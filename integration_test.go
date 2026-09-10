// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

//go:build integration

package main_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
	_ "github.com/marcboeker/go-duckdb"
)

// Run with: CGO_ENABLED=1 go test -tags integration -v -run TestIntegration
// Requires the zip at workload-exports/2025-05-29-office-hours.zip

func TestIntegration_AllQueriesRunClean(t *testing.T) {
	zipPath := filepath.Join("..", "workload-exports", "2025-05-29-office-hours.zip")
	if _, err := os.Stat(zipPath); err != nil {
		t.Skipf("zip not found at %s: %v", zipPath, err)
	}

	dest := t.TempDir()
	files, err := loader.ExtractZip(zipPath, dest)
	if err != nil {
		t.Fatalf("ExtractZip: %v", err)
	}

	db, err := loader.OpenDuckDB()
	if err != nil {
		t.Fatalf("OpenDuckDB: %v", err)
	}
	defer db.Close()

	status := loader.NewLoadStatus()
	loader.LoadCSVs(db, files, status)

	for _, q := range catalog.All() {
		t.Run(q.ID, func(t *testing.T) {
			rows, err := db.Query(q.SQL)
			if err != nil {
				t.Errorf("query %s failed: %v", q.ID, err)
				return
			}
			defer rows.Close()
			cols, _ := rows.Columns()
			if len(cols) == 0 {
				t.Errorf("query %s returned no columns", q.ID)
			}
			// consume rows to catch scan errors
			for rows.Next() {
				vals := make([]any, len(cols))
				ptrs := make([]any, len(cols))
				for i := range vals {
					ptrs[i] = &vals[i]
				}
				rows.Scan(ptrs...)
			}
		})
	}
}
