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
	"archive/zip"
	"os"
	"path/filepath"
	"testing"

	"github.com/adobe/cockroachdb-workload-analyzer/internal/loader"
)

func makeTestZip(t *testing.T, files map[string]string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "test-*.zip")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	w := zip.NewWriter(f)
	for name, content := range files {
		fw, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		fw.Write([]byte(content))
	}
	w.Close()
	return f.Name()
}

func TestExtractZip_ExtractsFiles(t *testing.T) {
	zipPath := makeTestZip(t, map[string]string{
		"metadata.json":                      `{"version":"1.0.0"}`,
		"crdb_internal.cluster_settings.csv": "variable,value\nfoo,bar",
	})
	dest := t.TempDir()

	files, err := loader.ExtractZip(zipPath, dest)
	if err != nil {
		t.Fatalf("ExtractZip: %v", err)
	}

	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d", len(files))
	}
	for name, path := range files {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("file %s not on disk at %s", name, path)
		}
	}
}

func TestExtractZip_BadZip(t *testing.T) {
	f, _ := os.CreateTemp(t.TempDir(), "bad-*.zip")
	f.WriteString("not a zip file")
	f.Close()

	_, err := loader.ExtractZip(f.Name(), t.TempDir())
	if err == nil {
		t.Error("expected error for bad zip, got nil")
	}
}

func TestExtractZip_MissingFile(t *testing.T) {
	_, err := loader.ExtractZip("/nonexistent/path.zip", t.TempDir())
	if err == nil {
		t.Error("expected error for missing file, got nil")
	}
}

func TestExtractedFiles_Path(t *testing.T) {
	zipPath := makeTestZip(t, map[string]string{
		"metadata.json": `{"version":"1.0.0"}`,
	})
	dest := t.TempDir()

	files, _ := loader.ExtractZip(zipPath, dest)
	path, ok := files["metadata.json"]
	if !ok {
		t.Fatal("expected metadata.json in result")
	}
	if !filepath.IsAbs(path) {
		t.Errorf("expected absolute path, got %s", path)
	}
}
