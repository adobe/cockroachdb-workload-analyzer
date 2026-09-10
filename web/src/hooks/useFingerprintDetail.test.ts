// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useFingerprintDetail } from './useFingerprintDetail'
import * as api from '../api'

vi.mock('../api', () => ({
  runQuery: vi.fn(),
}))

const DETAIL_COLS = [
  'fingerprint_id',
  'query_text',
  'executions',
  'mean_run_lat_sec',
  'contention_sec',
  'full_scan',
]

function detailRow(
  fp: string,
  text: string,
  exec: number,
  lat: number,
  cont: number | null,
  full: boolean,
) {
  return [fp, text, exec, lat, cont, full]
}

describe('useFingerprintDetail', () => {
  beforeEach(() => {
    vi.mocked(api.runQuery).mockReset()
  })

  it('resolves a statement fingerprint (step 1 hit) into one StmtDetail with stats', async () => {
    vi.mocked(api.runQuery).mockResolvedValueOnce({
      columns: DETAIL_COLS,
      rows: [detailRow('\\xstmt1', 'SELECT 1', 100, 0.5, 0.01, true)],
      duration_ms: 1,
    })

    const { result } = renderHook(() => useFingerprintDetail())
    await act(async () => {
      await result.current.lookup('\\xstmt1')
    })

    expect(result.current.kind).toBe('statement')
    expect(result.current.statements).toEqual([
      {
        fingerprintId: '\\xstmt1',
        queryText: 'SELECT 1',
        executions: 100,
        meanRunLatSec: 0.5,
        contentionSec: 0.01,
        fullScan: true,
      },
    ])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('resolves a transaction fingerprint (step 1 empty) into N constituent statements', async () => {
    vi.mocked(api.runQuery)
      // Step 1: not a statement fingerprint
      .mockResolvedValueOnce({ columns: DETAIL_COLS, rows: [], duration_ms: 1 })
      // Step 2: transaction_fingerprint_id join returns its statements
      .mockResolvedValueOnce({
        columns: DETAIL_COLS,
        rows: [
          detailRow('\\xstmtA', 'SELECT a', 50, 0.3, 0.02, false),
          detailRow('\\xstmtB', 'UPDATE b', 20, 0.1, null, false),
        ],
        duration_ms: 1,
      })

    const { result } = renderHook(() => useFingerprintDetail())
    await act(async () => {
      await result.current.lookup('\\xtxn1')
    })

    expect(result.current.kind).toBe('transaction')
    expect(result.current.statements).toHaveLength(2)
    expect(result.current.statements[0].fingerprintId).toBe('\\xstmtA')
    expect(result.current.statements[1].contentionSec).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns kind=none when neither a statement nor a transaction matches', async () => {
    vi.mocked(api.runQuery)
      .mockResolvedValueOnce({ columns: DETAIL_COLS, rows: [], duration_ms: 1 })
      .mockResolvedValueOnce({ columns: DETAIL_COLS, rows: [], duration_ms: 1 })

    const { result } = renderHook(() => useFingerprintDetail())
    await act(async () => {
      await result.current.lookup('\\xnotfound000000000')
    })

    expect(result.current.kind).toBe('none')
    expect(result.current.statements).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('sets error state when runQuery returns an error', async () => {
    vi.mocked(api.runQuery).mockResolvedValueOnce({
      columns: [],
      rows: [],
      duration_ms: 1,
      error: 'table not found',
    })

    const { result } = renderHook(() => useFingerprintDetail())
    await act(async () => {
      await result.current.lookup('\\xcaaa')
    })

    expect(result.current.error).toBe('table not found')
    expect(result.current.statements).toEqual([])
    expect(result.current.kind).toBe('none')
    expect(result.current.loading).toBe(false)
  })

  it('sets loading=true while resolving and loading=false after', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof api.runQuery>>) => void
    vi.mocked(api.runQuery).mockReturnValueOnce(
      new Promise(r => { resolve = r })
    )

    const { result } = renderHook(() => useFingerprintDetail())
    act(() => { result.current.lookup('\\xcaaa') })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolve({
        columns: DETAIL_COLS,
        rows: [detailRow('\\xcaaa', 'SELECT 3', 1, 0.01, 0, false)],
        duration_ms: 1,
      })
    })
    expect(result.current.loading).toBe(false)
  })
})
