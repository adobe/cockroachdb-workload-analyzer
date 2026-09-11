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
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

const testMetaJSON = `{
  "version": "1.0.0",
  "timestamp": "2026-05-29T14:18:48Z",
  "export_config": {
    "TimeRange": { "Start": "2026-05-28T19:00:00Z", "End": "2026-05-29T18:48:00Z" }
  },
  "cluster_version": "CockroachDB CCL v26.2.1",
  "organization": "Cockroach Cloud"
}`

func TestParseMeta(t *testing.T) {
	path := filepath.Join(t.TempDir(), "metadata.json")
	os.WriteFile(path, []byte(testMetaJSON), 0o644)

	files := loader.ExtractedFiles{"metadata.json": path}
	meta, err := loader.ParseMeta(files)
	if err != nil {
		t.Fatalf("ParseMeta: %v", err)
	}

	if meta.ClusterVersion != "CockroachDB CCL v26.2.1" {
		t.Errorf("ClusterVersion = %q", meta.ClusterVersion)
	}
	if meta.Organization != "Cockroach Cloud" {
		t.Errorf("Organization = %q", meta.Organization)
	}
	if meta.TimeRange.Start != "2026-05-28T19:00:00Z" {
		t.Errorf("TimeRange.Start = %q", meta.TimeRange.Start)
	}
	if meta.TimeRange.End != "2026-05-29T18:48:00Z" {
		t.Errorf("TimeRange.End = %q", meta.TimeRange.End)
	}
}

// Meta is what /api/meta serves verbatim, so its wire shape is part of the
// contract: the export window goes out as snake_case like every other field.
func TestMeta_MarshalsTimeRange(t *testing.T) {
	meta := &loader.Meta{TimeRange: loader.TimeRange{Start: "2026-05-28T19:00:00Z", End: "2026-05-29T18:48:00Z"}}
	data, err := json.Marshal(meta)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	want := `"time_range":{"start":"2026-05-28T19:00:00Z","end":"2026-05-29T18:48:00Z"}`
	if !strings.Contains(string(data), want) {
		t.Errorf("Marshal = %s, want it to contain %s", data, want)
	}
}

// An export without metadata.json yields a zero Meta; the API should then omit
// time_range entirely rather than emit empty strings the UI has to special-case.
func TestMeta_MarshalOmitsEmptyTimeRange(t *testing.T) {
	data, err := json.Marshal(&loader.Meta{})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if strings.Contains(string(data), "time_range") {
		t.Errorf("zero Meta marshals time_range: %s", data)
	}
}

func TestParseSchemas(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example_db.schema.txt")
	os.WriteFile(path, []byte("CREATE TABLE foo (id INT);"), 0o644)

	files := loader.ExtractedFiles{"example_db.schema.txt": path}
	schemas, err := loader.ParseSchemas(files)
	if err != nil {
		t.Fatalf("ParseSchemas: %v", err)
	}

	if schemas["example_db"] != "CREATE TABLE foo (id INT);" {
		t.Errorf("schema mismatch: %q", schemas["example_db"])
	}
}
