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
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type Meta struct {
	Version        string `json:"version"`
	Timestamp      string `json:"timestamp"`
	ClusterVersion string `json:"cluster_version"`
	ClusterID      string `json:"cluster_id"`
	Organization   string `json:"organization"`
	VirtualCluster bool   `json:"virtual_cluster"`
	// TimeRange is the window the export covers. It is omitted when the export
	// carried no metadata.json, so the UI can treat "absent" as "unknown".
	TimeRange TimeRange `json:"time_range,omitzero"`
}

// TimeRange is the export window as RFC 3339 timestamps, as written by
// workload-exporter. It is served as-is; the UI formats it for display.
type TimeRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// Schemas maps database name → schema text content.
type Schemas map[string]string

// rawMeta mirrors the actual JSON structure for unmarshalling.
type rawMeta struct {
	Version        string `json:"version"`
	Timestamp      string `json:"timestamp"`
	ClusterVersion string `json:"cluster_version"`
	ClusterID      string `json:"cluster_id"`
	Organization   string `json:"organization"`
	VirtualCluster bool   `json:"virtual_cluster"`
	ExportConfig   struct {
		// workload-exporter writes these keys in PascalCase; Meta re-exposes
		// them in the snake_case the rest of /api/meta uses.
		TimeRange struct {
			Start string `json:"Start"`
			End   string `json:"End"`
		} `json:"TimeRange"`
	} `json:"export_config"`
}

func ParseMeta(files ExtractedFiles) (*Meta, error) {
	path, ok := files["metadata.json"]
	if !ok {
		return &Meta{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading metadata.json: %w", err)
	}

	var raw rawMeta
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing metadata.json: %w", err)
	}

	return &Meta{
		Version:        raw.Version,
		Timestamp:      raw.Timestamp,
		ClusterVersion: raw.ClusterVersion,
		ClusterID:      raw.ClusterID,
		Organization:   raw.Organization,
		VirtualCluster: raw.VirtualCluster,
		TimeRange: TimeRange{
			Start: raw.ExportConfig.TimeRange.Start,
			End:   raw.ExportConfig.TimeRange.End,
		},
	}, nil
}

func ParseSchemas(files ExtractedFiles) (Schemas, error) {
	schemas := Schemas{}
	for name, path := range files {
		if !strings.HasSuffix(name, ".schema.txt") {
			continue
		}
		dbName := strings.TrimSuffix(name, ".schema.txt")
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", name, err)
		}
		schemas[dbName] = string(data)
	}
	return schemas, nil
}
