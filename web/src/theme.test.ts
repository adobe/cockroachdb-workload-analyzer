// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { describe, expect, it } from 'vitest'
import {
  applyTheme, isThemeName, readPreference, resolveTheme, systemTheme, writePreference,
  STORAGE_KEY, LIGHT_QUERY, CONTRAST_QUERY,
} from './theme'

const matching = (...queries: string[]) => (q: string) => queries.includes(q)

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
}

describe('systemTheme', () => {
  it('defaults to dark when the OS states no light preference', () => {
    expect(systemTheme(matching())).toBe('dark')
  })
  it('picks light when the OS prefers light', () => {
    expect(systemTheme(matching(LIGHT_QUERY))).toBe('light')
  })
  it('upgrades to the high-contrast variant when the OS asks for more contrast', () => {
    expect(systemTheme(matching(CONTRAST_QUERY))).toBe('dark-hc')
    expect(systemTheme(matching(LIGHT_QUERY, CONTRAST_QUERY))).toBe('light-hc')
  })
})

describe('resolveTheme', () => {
  it('returns the explicit preference regardless of the OS', () => {
    expect(resolveTheme('light-hc', matching())).toBe('light-hc')
  })
  it('follows the OS for the system preference', () => {
    expect(resolveTheme('system', matching(LIGHT_QUERY))).toBe('light')
  })
})

describe('readPreference', () => {
  it('returns system when nothing is stored or storage is unavailable', () => {
    expect(readPreference(new MemoryStorage())).toBe('system')
    expect(readPreference(undefined)).toBe('system')
  })
  it('returns a stored theme name', () => {
    const s = new MemoryStorage()
    s.setItem(STORAGE_KEY, 'dark-hc')
    expect(readPreference(s)).toBe('dark-hc')
  })
  it('ignores garbage in storage', () => {
    const s = new MemoryStorage()
    s.setItem(STORAGE_KEY, 'purple')
    expect(readPreference(s)).toBe('system')
  })
  it('tolerates a storage that throws', () => {
    const s = { getItem: () => { throw new Error('denied') } }
    expect(readPreference(s)).toBe('system')
  })
})

describe('writePreference', () => {
  it('stores a theme and removes the key for system', () => {
    const s = new MemoryStorage()
    writePreference(s, 'light')
    expect(s.getItem(STORAGE_KEY)).toBe('light')
    writePreference(s, 'system')
    expect(s.getItem(STORAGE_KEY)).toBeNull()
  })
  it('tolerates a storage that throws', () => {
    const s = { setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(() => writePreference(s, 'light')).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('sets the data attribute and color-scheme on the root', () => {
    const root = document.createElement('html')
    applyTheme(root, 'light-hc')
    expect(root.dataset.theme).toBe('light-hc')
    expect(root.style.colorScheme).toBe('light')
    applyTheme(root, 'dark')
    expect(root.style.colorScheme).toBe('dark')
  })
})

describe('isThemeName', () => {
  it('accepts only the four theme names', () => {
    expect(isThemeName('dark')).toBe(true)
    expect(isThemeName('system')).toBe(false)
    expect(isThemeName(null)).toBe(false)
  })
})
