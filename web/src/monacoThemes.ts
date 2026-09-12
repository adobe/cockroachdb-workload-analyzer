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
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
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

export function monacoThemeName(theme: ThemeName): string {
  return `wa-${theme}`
}

// Reads the tokens that are active *now* (the UI theme is applied before the
// editor mounts or re-themes), so it must be called after applyTheme. It
// re-defines on every call; defineTheme is cheap and this keeps the editor in
// step with any token change.
export function ensureMonacoTheme(theme: ThemeName): string {
  const name = monacoThemeName(theme)
  monaco.editor.defineTheme(name, {
    base: BASES[theme],
    inherit: true,
    rules: [],
    colors: {
      'editor.background': token('--bg-base'),
      'editor.foreground': token('--text-primary'),
      'editorLineNumber.foreground': token('--text-muted'),
      'editor.lineHighlightBackground': token('--bg-surface'),
      'editor.selectionBackground': token('--bg-selected'),
      'editorCursor.foreground': token('--accent'),
      focusBorder: token('--focus-ring'),
    },
  })
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
