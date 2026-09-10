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

export interface MetaResult {
  version: string
  timestamp: string
  cluster_version: string
  cluster_id: string
  organization: string
  virtual_cluster: boolean
}

export interface QueryDef {
  id: string
  category: string
  name: string
  description: string
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

export async function fetchStatus(): Promise<StatusResult> {
  const res = await fetch('/api/status')
  return res.json()
}

export async function fetchMeta(): Promise<MetaResult> {
  const res = await fetch('/api/meta')
  return res.json()
}

export async function fetchQueries(): Promise<QueryDef[]> {
  const res = await fetch('/api/queries')
  return res.json()
}

export async function fetchSchema(): Promise<SchemaResult> {
  const res = await fetch('/api/schema')
  return res.json()
}

// normalizeRun guards against a null `rows` (a zero-row result serializes to
// null server-side); components read result.rows.length without a null check.
function normalizeRun(r: RunResult): RunResult {
  return { ...r, rows: r.rows ?? [] }
}

export async function runQuery(sql: string): Promise<RunResult> {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  return normalizeRun(await res.json())
}

export async function fetchDatabases(): Promise<string[]> {
  const res = await fetch('/api/databases')
  return res.json()
}

export async function runCatalogQuery(queryId: string, db: string): Promise<RunResult> {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_id: queryId, db }),
  })
  return normalizeRun(await res.json())
}
