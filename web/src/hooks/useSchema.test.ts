// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSchema } from './useSchema'

vi.mock('../api', () => ({
  fetchSchema: vi.fn(),
}))

import { fetchSchema } from '../api'

const schema = {
  databases: { staging: 'CREATE TABLE staging ...', prod: 'CREATE TABLE prod ...' },
}

describe('useSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchSchema).mockResolvedValue(schema)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not fetch while disabled', () => {
    const { result } = renderHook(() => useSchema(false))
    expect(fetchSchema).not.toHaveBeenCalled()
    expect(result.current.databases).toEqual([])
    expect(result.current.ddl).toBeNull()
  })

  it('fetches once enabled and selects the first database in sorted order', async () => {
    const { result } = renderHook(() => useSchema(true))
    await waitFor(() => expect(result.current.databases).toEqual(['prod', 'staging']))
    expect(result.current.selected).toBe('prod')
    expect(result.current.ddl).toBe('CREATE TABLE prod ...')
  })

  it('exposes the DDL of whichever database is selected', async () => {
    const { result } = renderHook(() => useSchema(true))
    await waitFor(() => expect(result.current.selected).toBe('prod'))
    act(() => result.current.setSelected('staging'))
    expect(result.current.ddl).toBe('CREATE TABLE staging ...')
  })

  it('fetches only once even if disabled and re-enabled', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useSchema(enabled), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(result.current.selected).toBe('prod'))
    rerender({ enabled: false })
    rerender({ enabled: true })
    expect(fetchSchema).toHaveBeenCalledTimes(1)
  })

  it('reports a load error and lets the caller dismiss it', async () => {
    vi.mocked(fetchSchema).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSchema(true))
    await waitFor(() => expect(result.current.error).toMatch(/schema/i))
    act(() => result.current.dismissError())
    expect(result.current.error).toBeNull()
  })
})
