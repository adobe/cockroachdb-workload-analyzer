// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

export interface TableEntry {
  name: string
  loaded: boolean
  error?: string
}

export interface StatusResult {
  state: 'loading' | 'ready'
  progress: number
  tables: TableEntry[]
}

// TimeRange is the window the export covers, as RFC 3339 timestamps.
export interface TimeRange {
  start: string
  end: string
}

export interface MetaResult {
  version: string
  timestamp: string
  cluster_version: string
  cluster_id: string
  organization: string
  virtual_cluster: boolean
  // Absent when the export shipped no metadata.json.
  time_range?: TimeRange
}

// QueryDef mirrors the backend catalog.Query: identity/labels plus the SQL text
// and an optional per-database filter expression. /api/queries returns all of
// it; QueryList only reads the labels, the SQL tab uses `sql`, and the analysis
// tab uses `db_filter_expr` to decide whether the database picker applies.
export interface QueryDef {
  id: string
  category: string
  name: string
  description: string
  sql: string
  db_filter_expr?: string
}

export interface RunResult {
  columns: string[]
  rows: unknown[][]
  duration_ms: number
  error?: string
}

export interface SchemaResult {
  databases: Record<string, string>
}

// ApiError is thrown for any non-2xx response so callers can distinguish a real
// HTTP failure from a valid-but-empty result. Without it, a failed fetch used to
// slip through res.json() and render as a silently empty view.
export class ApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly url: string

  constructor(status: number, statusText: string, url: string) {
    super(`Request to ${url} failed: ${status} ${statusText}`)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.url = url
  }
}

// requestJSON is the single fetch chokepoint: it checks res.ok before touching
// the body, so an error response (often HTML, which res.json() would choke on)
// surfaces as an ApiError instead of a swallowed parse failure.
async function requestJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new ApiError(res.status, res.statusText, url)
  return res.json() as Promise<T>
}

export function fetchStatus(): Promise<StatusResult> {
  return requestJSON('/api/status')
}

export function fetchMeta(): Promise<MetaResult> {
  return requestJSON('/api/meta')
}

export function fetchQueries(): Promise<QueryDef[]> {
  return requestJSON('/api/queries')
}

export function fetchSchema(): Promise<SchemaResult> {
  return requestJSON('/api/schema')
}

// postRun is the one call to /api/run. The server always sends an array for a
// successful result, but its error responses carry `rows: null`, and
// ResultsTable reads result.rows without a null check.
async function postRun(body: object): Promise<RunResult> {
  const r = await requestJSON<RunResult>('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ...r, rows: r.rows ?? [] }
}

export function runQuery(sql: string): Promise<RunResult> {
  return postRun({ sql })
}

export function runCatalogQuery(queryId: string, db: string): Promise<RunResult> {
  return postRun({ query_id: queryId, db })
}

// runFailure turns a rejected run (HTTP failure, network error) into a
// RunResult that ResultsTable shows through its error state, so the failure
// never becomes an unhandled rejection that leaves the pane on "No results".
export function runFailure(err: unknown): RunResult {
  console.error(err)
  return { columns: [], rows: [], duration_ms: 0, error: 'Query failed to run. The server may be unavailable — try reloading.' }
}

export function fetchDatabases(): Promise<string[]> {
  return requestJSON('/api/databases')
}
