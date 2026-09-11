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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRun } from './useRun'
import * as api from '../api'

describe('useRun', () => {
  beforeEach(() => {
    vi.spyOn(api, 'runQuery')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with null result and not loading', () => {
    const { result } = renderHook(() => useRun())
    expect(result.current.result).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('sets loading true while running', async () => {
    let resolve: (v: api.RunResult) => void
    vi.mocked(api.runQuery).mockReturnValue(new Promise(r => { resolve = r }))

    const { result } = renderHook(() => useRun())
    act(() => { result.current.run('SELECT 1') })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolve!({ columns: ['?column?'], rows: [[1]], duration_ms: 5 })
    })
    expect(result.current.loading).toBe(false)
  })

  it('populates result on success', async () => {
    const mockResult: api.RunResult = { columns: ['id'], rows: [[42]], duration_ms: 10 }
    vi.mocked(api.runQuery).mockResolvedValue(mockResult)

    const { result } = renderHook(() => useRun())
    await act(async () => { await result.current.run('SELECT 42 AS id') })

    expect(result.current.result).toEqual(mockResult)
  })

  it('surfaces a rejected run as an error result and clears loading', async () => {
    vi.mocked(api.runQuery).mockRejectedValue(new api.ApiError(500, 'Internal Server Error', '/api/run'))

    const { result } = renderHook(() => useRun())
    await act(async () => { await result.current.run('SELECT bad') })

    expect(result.current.loading).toBe(false)
    expect(result.current.result?.error).toBeTruthy()
  })
})
