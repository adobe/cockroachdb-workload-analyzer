// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock is hoisted above every import, so the spy it closes over must be
// created with vi.hoisted or it would be in the temporal dead zone.
const { defineTheme } = vi.hoisted(() => ({ defineTheme: vi.fn() }))
vi.mock('monaco-editor/esm/vs/editor/editor.api.js', () => ({
  editor: { defineTheme },
}))

import { editorFontOptions, ensureMonacoTheme, normalizeHex } from './monacoThemes'

function setTokens(vars: Record<string, string>) {
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}

beforeEach(() => {
  defineTheme.mockClear()
  setTokens({
    '--bg-base': '#0f1317', '--bg-surface': '#171c22', '--bg-raised': '#20272f', '--bg-selected': '#16302f',
    '--text-primary': '#e9eef3', '--text-muted': '#8d9aa8', '--accent': '#3fd1bc', '--focus-ring': '#5fe3cf',
    '--text-md': '14px', '--font-mono': 'ui-monospace, Menlo, monospace',
  })
})

describe('ensureMonacoTheme', () => {
  it('registers a theme inheriting from the matching base with token colors', () => {
    expect(ensureMonacoTheme('dark')).toBe('wa-dark')
    expect(defineTheme).toHaveBeenCalledWith('wa-dark', expect.objectContaining({
      base: 'vs-dark',
      inherit: true,
      colors: expect.objectContaining({
        'editor.background': '#0f1317',
        'editor.foreground': '#e9eef3',
        'editorLineNumber.foreground': '#8d9aa8',
        'editor.lineHighlightBackground': '#171c22',
        'editor.selectionBackground': '#16302f',
        'editorCursor.foreground': '#3fd1bc',
        'focusBorder': '#5fe3cf',
      }),
    }))
  })

  it('maps each UI theme to the right Monaco base', () => {
    ensureMonacoTheme('light')
    ensureMonacoTheme('dark-hc')
    ensureMonacoTheme('light-hc')
    const bases = defineTheme.mock.calls.map(c => [c[0], (c[1] as { base: string }).base])
    expect(bases).toEqual([['wa-light', 'vs'], ['wa-dark-hc', 'hc-black'], ['wa-light-hc', 'hc-light']])
  })

  it('re-registers on every call so a token change is picked up', () => {
    ensureMonacoTheme('dark')
    setTokens({ '--bg-base': '#000000' })
    ensureMonacoTheme('dark')
    expect(defineTheme).toHaveBeenCalledTimes(2)
    expect((defineTheme.mock.calls[1][1] as { colors: Record<string, string> }).colors['editor.background']).toBe('#000000')
  })

  it('falls back to the base theme name when defineTheme throws', () => {
    defineTheme.mockImplementationOnce(() => {
      throw new Error('Illegal value')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(ensureMonacoTheme('light-hc')).toBe('hc-light')
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('normalizeHex', () => {
  it('expands 3- and 4-digit hex to 6- and 8-digit', () => {
    expect(normalizeHex('#fff')).toBe('#ffffff')
    expect(normalizeHex('#000')).toBe('#000000')
    expect(normalizeHex('#abcd')).toBe('#aabbccdd')
  })

  it('leaves already-expanded hex unchanged', () => {
    expect(normalizeHex('#3fd1bc')).toBe('#3fd1bc')
    expect(normalizeHex('#3fd1bc80')).toBe('#3fd1bc80')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHex('  #fff  ')).toBe('#ffffff')
  })

  it('returns a non-hex value trimmed and unchanged', () => {
    expect(normalizeHex('  ui-monospace, Menlo, monospace  ')).toBe('ui-monospace, Menlo, monospace')
  })
})

describe('ensureMonacoTheme with Chrome-style short hex', () => {
  it('expands short hex tokens before handing them to Monaco', () => {
    setTokens({ '--bg-base': '#fff', '--text-primary': '#000', '--focus-ring': '#000' })
    ensureMonacoTheme('light-hc')
    expect(defineTheme).toHaveBeenCalledWith('wa-light-hc', expect.objectContaining({
      colors: expect.objectContaining({
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'focusBorder': '#000000',
      }),
    }))
  })
})

describe('editorFontOptions', () => {
  it('reads size and family from the tokens', () => {
    expect(editorFontOptions()).toEqual({ fontSize: 14, fontFamily: 'ui-monospace, Menlo, monospace' })
  })

  it('falls back sanely when tokens are missing', () => {
    document.documentElement.style.removeProperty('--text-md')
    document.documentElement.style.removeProperty('--font-mono')
    expect(editorFontOptions()).toEqual({ fontSize: 14, fontFamily: 'monospace' })
  })
})
