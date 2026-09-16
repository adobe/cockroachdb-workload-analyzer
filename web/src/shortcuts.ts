// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// Single source of truth for the app's keyboard shortcuts: the guards the key
// handlers share and the catalog the help dialog renders. Keeping the catalog
// next to the guards means adding a binding and documenting it happen in the
// same file.

import { TABS } from './tabIds'

export interface Shortcut {
  // Alternatives that do the same thing (["←", "→"] is rendered "← or →").
  // A chord is one entry with its parts joined by "+" ("⌘+↵").
  keys: string[]
  description: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

// Single-key shortcuts must not fire while the user is typing. Monaco renders
// a hidden textarea, but focus can land on other nodes inside its container
// (e.g. the suggest widget), so the whole container counts as editable.
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Attribute check rather than isContentEditable: it also matches nodes
  // nested inside an editable region, and jsdom does not implement the property.
  return target.closest('[contenteditable]:not([contenteditable="false"]), .monaco-editor-container') !== null
}

// While a modal (the fingerprint drawer, the shortcuts dialog) is open, the
// page behind it must not react to single-key shortcuts; Escape is handled by
// the modal itself.
export function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

// The SQL editor runs on Cmd+Enter on Apple platforms and Ctrl+Enter elsewhere
// (Monaco's CtrlCmd). The dialog shows whichever applies to the viewer.
export function runModifierLabel(platform: string = navigator.platform): string {
  return /Mac|iPhone|iPad|iPod/.test(platform) ? '⌘' : 'Ctrl'
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close the open dialog or drawer' },
    ],
  },
  {
    title: 'Tabs',
    shortcuts: [
      ...TABS.map((t, i) => ({ keys: [String(i + 1)], description: `Go to the ${t.label} tab` })),
      { keys: ['←', '→'], description: 'Previous or next tab, after selecting one with a digit, click or Tab' },
      { keys: ['Home', 'End'], description: 'First or last tab, after selecting one with a digit, click or Tab' },
    ],
  },
  {
    title: 'Queries',
    shortcuts: [
      { keys: ['j'], description: 'Next query. Opens it on Analysis; highlights it on SQL' },
      { keys: ['k'], description: 'Previous query. Opens it on Analysis; highlights it on SQL' },
      { keys: ['↑', '↓'], description: 'Previous or next query, while the list has focus' },
      { keys: ['Home', 'End'], description: 'First or last query, while the list has focus' },
      { keys: ['↵'], description: 'Open the highlighted query (SQL: insert it into the editor)' },
    ],
  },
  {
    title: 'SQL editor',
    shortcuts: [
      { keys: [`${runModifierLabel()}+↵`], description: 'Run the SQL in the editor' },
    ],
  },
]
