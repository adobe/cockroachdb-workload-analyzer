// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

/// <reference types="node" />

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, useEffect } from 'react'
import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'
import { CONTRAST_QUERY, LIGHT_QUERY, STORAGE_KEY, readPreference, resolveTheme } from '../theme'
import type { ThemePreference } from '../theme'
import { installMatchMedia } from '../test/matchMedia'

let media: ReturnType<typeof installMatchMedia>

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  media = installMatchMedia()
})

afterEach(() => {
  localStorage.clear()
})

describe('useTheme', () => {
  it('follows the OS when nothing is stored', () => {
    media = installMatchMedia([LIGHT_QUERY])
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('system')
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('combines dark and more-contrast into dark-hc', () => {
    media = installMatchMedia([CONTRAST_QUERY])
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark-hc')
  })

  it('prefers the stored value over the OS', () => {
    localStorage.setItem(STORAGE_KEY, 'light-hc')
    media = installMatchMedia([])
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('light-hc')
    expect(result.current.theme).toBe('light-hc')
  })

  it('tracks a live OS change while following the system', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    act(() => media.set(LIGHT_QUERY, true))
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('stops listening to the OS once a preference is stored', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('dark'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(media.listenerCount(LIGHT_QUERY)).toBe(0)
    act(() => media.set(LIGHT_QUERY, true))
    expect(result.current.theme).toBe('dark')
  })

  it('clears storage and resumes following the OS on system', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('system'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.theme).toBe('dark')
    act(() => media.set(LIGHT_QUERY, true))
    expect(result.current.theme).toBe('light')
  })

  it('works when matchMedia is unavailable', () => {
    // @ts-expect-error simulate an environment without matchMedia
    delete window.matchMedia
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('falls back to system when localStorage access throws', () => {
    // Chrome throws SecurityError on window.localStorage itself (not just
    // getItem/setItem) when site data is blocked. Simulate that by making
    // the accessor throw.
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      const { result } = renderHook(() => useTheme())
      expect(result.current.preference).toBe('system')
      expect(result.current.theme).toBe('dark')
    } finally {
      spy.mockRestore()
    }
  })

  it('applies the theme before descendants\' passive effects run', () => {
    // This file is .ts, not .tsx, so JSX doesn't parse here; build the
    // element tree with createElement instead.
    const recorded: Array<string | undefined> = []
    let setPreference: (p: ThemePreference) => void = () => {}

    function Child() {
      // A passive effect: if useTheme applied the theme from one of its own
      // passive effects, ordering between siblings/children would be
      // unspecified and this could observe the previous data-theme.
      useEffect(() => {
        recorded.push(document.documentElement.dataset.theme)
      })
      return null
    }

    function Harness() {
      const { setPreference: set } = useTheme()
      setPreference = set
      return createElement(Child)
    }

    render(createElement(Harness))
    act(() => setPreference('light-hc'))
    expect(recorded.at(-1)).toBe('light-hc')
  })
})

// The bootstrap in index.html is a classic script that cannot import
// theme.ts, so its logic is duplicated by hand. This keeps the copy honest.
describe('index.html bootstrap script', () => {
  // jsdom shadows the global URL constructor with one bound to the page's
  // location, so `new URL('../../index.html', import.meta.url)` resolves
  // against http://localhost:3000 instead of the file: base and readFileSync
  // rejects it ("URL must be of scheme file"). Resolve the path through
  // node:path/node:url instead, which bypass that shadowed global.
  const indexHtmlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html')
  const html = readFileSync(indexHtmlPath, 'utf8')
  const scripts = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const bootstrap = scripts.find(s => s.includes(STORAGE_KEY))

  it('exists as a classic inline script in <head>', () => {
    expect(bootstrap).toBeDefined()
    expect(html.indexOf(bootstrap!)).toBeLessThan(html.indexOf('</head>'))
  })

  const cases: Array<{ stored: string | null; os: string[] }> = [
    { stored: null, os: [] },
    { stored: null, os: [LIGHT_QUERY] },
    { stored: null, os: [CONTRAST_QUERY] },
    { stored: null, os: [LIGHT_QUERY, CONTRAST_QUERY] },
    { stored: 'light', os: [CONTRAST_QUERY] },
    { stored: 'dark-hc', os: [LIGHT_QUERY] },
    { stored: 'garbage', os: [LIGHT_QUERY] },
  ]

  it.each(cases)('agrees with resolveTheme for %o', ({ stored, os }) => {
    localStorage.clear()
    if (stored !== null) localStorage.setItem(STORAGE_KEY, stored)
    media = installMatchMedia(os)
    delete document.documentElement.dataset.theme
    new Function(bootstrap!)()
    const expected = resolveTheme(readPreference(localStorage), q => window.matchMedia(q).matches)
    expect(document.documentElement.dataset.theme).toBe(expected)
    expect(document.documentElement.style.colorScheme).toBe(expected.startsWith('dark') ? 'dark' : 'light')
  })

  it.each(cases)('useTheme agrees with resolveTheme for %o', ({ stored, os }) => {
    localStorage.clear()
    if (stored !== null) localStorage.setItem(STORAGE_KEY, stored)
    media = installMatchMedia(os)
    delete document.documentElement.dataset.theme
    const { result } = renderHook(() => useTheme())
    const expected = resolveTheme(readPreference(localStorage), q => window.matchMedia(q).matches)
    expect(result.current.theme).toBe(expected)
  })
})
