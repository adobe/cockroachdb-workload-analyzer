// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSidebarHidden } from './useSidebarHidden'

const STORAGE_KEY = 'wa.sidebarHidden'

describe('useSidebarHidden', () => {
  afterEach(() => localStorage.clear())

  it('starts shown when nothing is stored', () => {
    const { result } = renderHook(() => useSidebarHidden())
    expect(result.current.hidden).toBe(false)
  })

  it('restores the stored hidden state', () => {
    localStorage.setItem(STORAGE_KEY, '1')
    const { result } = renderHook(() => useSidebarHidden())
    expect(result.current.hidden).toBe(true)
  })

  it('toggles and persists, removing the key once shown again', () => {
    const { result } = renderHook(() => useSidebarHidden())
    act(() => result.current.toggle())
    expect(result.current.hidden).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1')
    act(() => result.current.toggle())
    expect(result.current.hidden).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
