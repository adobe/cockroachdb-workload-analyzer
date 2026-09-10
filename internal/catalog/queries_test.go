// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package catalog_test

import (
	"strings"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/catalog"
)

func TestAllQueries_HaveRequiredFields(t *testing.T) {
	queries := catalog.All()
	if len(queries) == 0 {
		t.Fatal("expected at least one query")
	}
	ids := map[string]bool{}
	for _, q := range queries {
		if q.ID == "" {
			t.Errorf("query missing ID: %+v", q)
		}
		if q.Category == "" {
			t.Errorf("query %s missing Category", q.ID)
		}
		if q.Name == "" {
			t.Errorf("query %s missing Name", q.ID)
		}
		if strings.TrimSpace(q.SQL) == "" {
			t.Errorf("query %s has empty SQL", q.ID)
		}
		if ids[q.ID] {
			t.Errorf("duplicate query ID: %s", q.ID)
		}
		ids[q.ID] = true
	}
}

func TestAllQueries_Count(t *testing.T) {
	if got := len(catalog.All()); got != 26 {
		t.Errorf("expected 26 queries, got %d", got)
	}
}

func TestAllQueries_Categories(t *testing.T) {
	seen := map[string]int{}
	for _, q := range catalog.All() {
		seen[q.Category]++
	}
	want := map[string]int{
		"Statements":   13,
		"Transactions": 5,
		"Indexes":      4,
		"Cluster":      4,
	}
	for cat, count := range want {
		if seen[cat] != count {
			t.Errorf("category %s: want %d queries, got %d", cat, count, seen[cat])
		}
	}
}
