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
	"bytes"
	"io/fs"
	"testing"
)

// The security model promises that no workload data leaves the machine and
// that the binary is fully self-contained (works air-gapped). Loading editor
// code from a CDN at runtime would break both promises: @monaco-editor/react
// defaults to fetching monaco-editor from cdn.jsdelivr.net unless it is given
// a bundled instance via loader.config. This test scans every embedded UI
// asset to ensure no such CDN reference ships in the binary.
func TestEmbeddedAssetsHaveNoCDNReferences(t *testing.T) {
	forbidden := [][]byte{
		[]byte("cdn.jsdelivr.net"),
	}

	checked := 0
	err := fs.WalkDir(staticFiles, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		data, err := fs.ReadFile(staticFiles, path)
		if err != nil {
			return err
		}
		for _, needle := range forbidden {
			if bytes.Contains(data, needle) {
				t.Errorf("embedded asset %s references external host %q; the UI must be fully self-contained", path, needle)
			}
		}
		checked++
		return nil
	})
	if err != nil {
		t.Fatalf("walking embedded assets: %v", err)
	}
	if checked == 0 {
		t.Fatal("no embedded assets found; was web/dist built before running tests?")
	}
}

// The UI bundles only what the SQL editor actually uses: monaco's core API,
// the SQL syntax contribution, and the base editor worker. Importing the
// monaco-editor package root instead would pull in the TypeScript, CSS, HTML,
// and JSON language services plus ~70 unused language chunks — roughly 9 MB
// of dead weight in the binary. The budget below has comfortable headroom
// over the expected size, but fails long before a package-root import.
func TestEmbeddedAssetsWithinSizeBudget(t *testing.T) {
	const budget = 8 << 20 // 8 MiB

	var total int64
	err := fs.WalkDir(staticFiles, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		return nil
	})
	if err != nil {
		t.Fatalf("walking embedded assets: %v", err)
	}
	if total > budget {
		t.Errorf("embedded assets total %.1f MiB, budget is %.1f MiB; check for unused monaco language services/workers in the bundle", float64(total)/(1<<20), float64(budget)/(1<<20))
	}
}
