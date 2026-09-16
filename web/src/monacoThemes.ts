// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// Registers one Monaco theme per UI theme, built from the live token values
// so tokens.css stays the single source of truth. Syntax colors are inherited
// from Monaco's own base theme for that mode; only surfaces are overridden.
import * as monaco from 'monaco-editor/editor/editor.api.js'
import type { ThemeName } from './theme'

const BASES: Record<ThemeName, monaco.editor.BuiltinTheme> = {
  dark: 'vs-dark',
  light: 'vs',
  'dark-hc': 'hc-black',
  'light-hc': 'hc-light',
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Chrome serializes custom-property hex in shortest form (#000000 -> #000);
// Monaco's token theme accepts only 6- or 8-digit hex. Expand short forms.
export function normalizeHex(value: string): string {
  const m = /^#([0-9a-fA-F]{3,4})$/.exec(value.trim())
  if (!m) return value.trim()
  return '#' + [...m[1]].map(c => c + c).join('')
}

function color(name: string): string {
  return normalizeHex(token(name))
}

export function monacoThemeName(theme: ThemeName): string {
  return `wa-${theme}`
}

// Reads the tokens that are active *now* (the UI theme is applied before the
// editor mounts or re-themes), so it must be called after applyTheme. It
// re-defines on every call; defineTheme is cheap and this keeps the editor in
// step with any token change.
export function ensureMonacoTheme(theme: ThemeName): string {
  const name = monacoThemeName(theme)
  try {
    monaco.editor.defineTheme(name, {
      base: BASES[theme],
      inherit: true,
      rules: [],
      colors: {
        'editor.background': color('--bg-base'),
        'editor.foreground': color('--text-primary'),
        'editorLineNumber.foreground': color('--text-muted'),
        'editor.lineHighlightBackground': color('--bg-surface'),
        'editor.selectionBackground': color('--bg-selected'),
        'editorCursor.foreground': color('--accent'),
        focusBorder: color('--focus-ring'),
      },
    })
  } catch (err) {
    // A bad computed-style value (e.g. an unparsed custom property) would
    // otherwise throw out of this call and blank the whole app. Degrade to
    // Monaco's own base theme instead: unthemed but working.
    console.error(`Failed to define Monaco theme "${name}":`, err)
    return BASES[theme]
  }
  return name
}

export function editorFontOptions(): { fontSize: number; fontFamily: string } {
  const size = parseInt(token('--text-md'), 10)
  const family = token('--font-mono')
  return {
    fontSize: Number.isFinite(size) && size > 0 ? size : 14,
    fontFamily: family || 'monospace',
  }
}
