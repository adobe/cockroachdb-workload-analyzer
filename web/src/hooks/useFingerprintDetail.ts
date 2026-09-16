// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useState, useCallback } from 'react'
import { runQuery, type RunResult } from '../api'

export interface StmtDetail {
  fingerprintId: string
  queryText: string
  executions: number | null
  meanRunLatSec: number | null
  contentionSec: number | null
  fullScan: boolean
}

export type DetailKind = 'statement' | 'transaction' | 'none'

// The shared per-statement projection, used both when the clicked fingerprint is
// a statement (grouped on its own fingerprint_id) and when it is a transaction
// (grouped on each constituent statement, joined via transaction_fingerprint_id).
// contention_sec comes from sampled execution_statistics and may be NULL.
const STMT_DETAIL_COLS = `
  fingerprint_id,
  any_value(query) AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS mean_run_lat_sec,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.execution_statistics.contentionTime.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS contention_sec,
  BOOL_OR(CAST(json_extract(metadata, '$.fullScan') AS BOOLEAN)) AS full_scan`

function parseDetails(res: RunResult): StmtDetail[] {
  const idx = (name: string) => res.columns.indexOf(name)
  const iFp = idx('fingerprint_id')
  const iText = idx('query_text')
  const iExec = idx('executions')
  const iLat = idx('mean_run_lat_sec')
  const iCont = idx('contention_sec')
  const iFull = idx('full_scan')
  const num = (row: unknown[], i: number): number | null =>
    i >= 0 && row[i] != null ? Number(row[i]) : null
  return res.rows.map(row => ({
    fingerprintId: iFp >= 0 ? String(row[iFp] ?? '') : '',
    queryText: iText >= 0 ? String(row[iText] ?? '') : '',
    executions: num(row, iExec),
    meanRunLatSec: num(row, iLat),
    contentionSec: num(row, iCont),
    fullScan: iFull >= 0 ? Boolean(row[iFull]) : false,
  }))
}

// The two lookups tried in order for a clicked fingerprint: first as a
// statement fingerprint (aggregate its own stats), then as a transaction
// fingerprint (its constituent statements via the native
// transaction_fingerprint_id column, heaviest first).
function lookupSQL(safeId: string): [Exclude<DetailKind, 'none'>, string][] {
  return [
    ['statement', `SELECT ${STMT_DETAIL_COLS}
FROM stmt_stats
WHERE fingerprint_id = '${safeId}'
GROUP BY fingerprint_id`],
    ['transaction', `SELECT ${STMT_DETAIL_COLS}
FROM stmt_stats
WHERE transaction_fingerprint_id = '${safeId}'
GROUP BY fingerprint_id
ORDER BY
  SUM(
    CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
    CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)
  ) DESC NULLS LAST`],
  ]
}

export function useFingerprintDetail() {
  const [statements, setStatements] = useState<StmtDetail[]>([])
  const [kind, setKind] = useState<DetailKind>('none')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = useCallback(async (fingerprintId: string) => {
    setLoading(true)
    setStatements([])
    setKind('none')
    setError(null)
    try {
      for (const [k, sql] of lookupSQL(fingerprintId.replace(/'/g, "''"))) {
        const res = await runQuery(sql)
        if (res.error) { setError(res.error); return }
        if (res.rows.length > 0) {
          setStatements(parseDetails(res))
          setKind(k)
          return
        }
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  return { statements, kind, loading, error, lookup }
}
