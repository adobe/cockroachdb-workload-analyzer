// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// Display-only formatting for result-grid cells. Units are inferred from the
// column-name suffix the catalog queries use (`_sec`, `_mib`, `_pct`, `_bytes`).
// The raw value is preserved for the cell tooltip and for CSV/JSON export.

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

// formatDurationSec renders a duration given in seconds with an adaptive unit.
export function formatDurationSec(s: number): string {
  if (!isFinite(s)) return String(s)
  if (s === 0) return '0'
  const abs = Math.abs(s)
  if (abs < 1e-3) return `${round(s * 1e6, 0)} µs`
  if (abs < 1) return `${round(s * 1e3, 2)} ms`
  return `${round(s, 2)} s`
}

// formatBytes renders a byte count with IEC units.
export function formatBytes(n: number): string {
  if (!isFinite(n)) return String(n)
  const abs = Math.abs(n)
  if (abs < 1024) return `${round(n, 0)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']
  let v = n / 1024
  let i = 0
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${round(v, 2)} ${units[i]}`
}

// formatCell returns the display string for a cell given its column name.
// Non-numeric values and columns without a known unit suffix pass through as-is.
export function formatCell(column: string, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'number') {
    // Numeric strings in a unit column are still formatted; everything else is raw.
    const asNum = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    if (!Number.isFinite(asNum)) return String(value)
    return formatCell(column, asNum)
  }

  const col = column.toLowerCase()
  if (col.endsWith('_sec')) return formatDurationSec(value)
  if (col.endsWith('_mib')) return `${value} MiB`
  if (col.endsWith('_pct')) return `${value}%`
  if (col.endsWith('_bytes') || col.includes('bytes')) return formatBytes(value)
  return String(value)
}
