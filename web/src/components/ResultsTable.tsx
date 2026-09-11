// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useMemo, useState } from 'react'
import type { RunResult } from '../api'
import { downloadText, toCSV, toJSON } from '../resultExport'
import { formatCell } from '../format'

interface Props {
  result: RunResult | null
  loading: boolean
  onFingerprintClick?: (id: string) => void
}

type SortState = { col: number; dir: 'asc' | 'desc' }

// toNumber coerces a cell to a finite number, matching formatCell's rule:
// DuckDB returns bigints/decimals as strings, so numeric strings count as
// numbers. Anything else yields NaN and falls back to a lexical compare.
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return NaN
}

// compareCells orders two raw cell values for the given direction. NULLs always
// sort last, both directions. Numeric (or numeric-string) pairs compare as
// numbers; everything else compares lexically.
function compareCells(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  const an = toNumber(a)
  const bn = toNumber(b)
  let base: number
  if (Number.isFinite(an) && Number.isFinite(bn)) {
    base = an - bn
  } else {
    base = String(a).localeCompare(String(b))
  }
  return dir === 'desc' ? -base : base
}

export function ResultsTable({ result, loading, onFingerprintClick }: Props) {
  const [sort, setSort] = useState<SortState | null>(null)
  // Reset sort when a new result arrives (adjusting state during render — the
  // React-recommended pattern, avoids the set-state-in-effect lint rule).
  const [prevResult, setPrevResult] = useState(result)
  if (result !== prevResult) {
    setPrevResult(result)
    setSort(null)
  }

  // Sorted view of the rows. `[...rows].sort` is stable (ties keep the server's
  // original order), and it never mutates result.rows.
  const sortedRows = useMemo(() => {
    const rows = result?.rows ?? []
    if (!sort) return rows
    const { col, dir } = sort
    return [...rows].sort((ra, rb) => compareCells(ra[col], rb[col], dir))
  }, [result, sort])

  if (loading) {
    return <div className="results-state">Running...</div>
  }
  if (!result) {
    return <div className="results-state">No results — select a query or run SQL.</div>
  }
  if (result.error) {
    return <div className="results-error">{result.error}</div>
  }
  if (result.rows.length === 0) {
    return <div className="results-state">No rows — nothing to report for this query. ({result.duration_ms}ms)</div>
  }

  const fpColIndex = onFingerprintClick ? result.columns.indexOf('fingerprint_id') : -1
  const { columns } = result

  // Click cycles asc → desc → none (none restores the query's server ordering).
  const toggleSort = (col: number) => {
    setSort(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  return (
    <div className="results-wrapper">
      <div className="results-meta">
        <span>{sortedRows.length} rows · {result.duration_ms}ms</span>
        <span className="results-actions">
          <button
            className="export-btn"
            onClick={() => downloadText('workload-analyzer-result.csv', toCSV(columns, sortedRows), 'text/csv')}
          >
            CSV
          </button>
          <button
            className="export-btn"
            onClick={() => downloadText('workload-analyzer-result.json', toJSON(columns, sortedRows), 'application/json')}
          >
            JSON
          </button>
        </span>
      </div>
      <div className="results-scroll">
        <table className="results-table">
          <thead>
            <tr>
              {columns.map((c, j) => {
                const active = sort?.col === j
                // Neutral ⇅ at rest advertises sortability on every column; the
                // active column shows its direction (▲ asc / ▼ desc).
                const arrow = active ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'
                return (
                  <th key={c}>
                    <button
                      type="button"
                      className={active ? 'col-sort col-sort-active' : 'col-sort'}
                      onClick={() => toggleSort(j)}
                      title="Click to sort"
                    >
                      {c}<span className="col-sort-arrow">{arrow}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i}>
                {(row as unknown[]).map((cell, j) => {
                  if (j === fpColIndex && cell !== null) {
                    return (
                      <td key={j}>
                        <button
                          type="button"
                          className="fingerprint-link"
                          onClick={() => onFingerprintClick!(String(cell))}
                        >
                          {String(cell)}
                        </button>
                      </td>
                    )
                  }
                  // Cap wide text cells (e.g. query_text) with an ellipsis so
                  // long values don't force horizontal scrolling. Cells are
                  // formatted for display by column unit (_sec → ms, _bytes →
                  // human-readable, …); the tooltip keeps the raw value, and
                  // CSV/JSON export stays raw too.
                  return (
                    <td key={j} className="cell-truncate" title={cell === null ? undefined : String(cell)}>
                      {cell === null ? <span className="null">NULL</span> : formatCell(columns[j], cell)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
