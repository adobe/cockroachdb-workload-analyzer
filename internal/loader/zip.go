// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package loader

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// ExtractedFiles maps zip entry name → absolute path on disk.
type ExtractedFiles map[string]string

// ExtractZip extracts all entries from zipPath into destDir.
func ExtractZip(zipPath, destDir string) (ExtractedFiles, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("opening zip %s: %w", zipPath, err)
	}
	defer r.Close()

	result := ExtractedFiles{}
	for _, f := range r.File {
		dest := filepath.Join(destDir, filepath.Base(f.Name))
		if err := extractEntry(f, dest); err != nil {
			return nil, fmt.Errorf("extracting %s: %w", f.Name, err)
		}
		result[f.Name] = dest
	}
	return result, nil
}

func extractEntry(f *zip.File, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, rc)
	return err
}
