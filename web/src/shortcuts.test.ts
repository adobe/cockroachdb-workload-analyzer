// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { afterEach, describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, isEditableTarget, isModalOpen, runModifierLabel } from './shortcuts'

describe('isEditableTarget', () => {
  it('is true for inputs, textareas, selects and contenteditable regions', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true)
    }
    const region = document.createElement('div')
    region.setAttribute('contenteditable', 'true')
    const inner = document.createElement('span')
    region.appendChild(inner)
    expect(isEditableTarget(inner)).toBe(true)
    region.setAttribute('contenteditable', 'false')
    expect(isEditableTarget(inner)).toBe(false)
  })

  it('is true inside a Monaco editor container', () => {
    const container = document.createElement('div')
    container.className = 'monaco-editor-container'
    const inner = document.createElement('div')
    container.appendChild(inner)
    expect(isEditableTarget(inner)).toBe(true)
  })

  it('is false for buttons, plain elements and non-elements', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(document)).toBe(false)
  })
})

describe('isModalOpen', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('is true only while an aria-modal element is in the document', () => {
    expect(isModalOpen()).toBe(false)
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    expect(isModalOpen()).toBe(true)
  })
})

describe('runModifierLabel', () => {
  it('uses the command key on Apple platforms and Ctrl elsewhere', () => {
    expect(runModifierLabel('MacIntel')).toBe('⌘')
    expect(runModifierLabel('iPhone')).toBe('⌘')
    expect(runModifierLabel('Win32')).toBe('Ctrl')
    expect(runModifierLabel('Linux x86_64')).toBe('Ctrl')
    expect(runModifierLabel('')).toBe('Ctrl')
  })
})

describe('SHORTCUT_GROUPS', () => {
  it('documents every shortcut the app binds, grouped with a title', () => {
    const all = SHORTCUT_GROUPS.flatMap(g => g.shortcuts)
    const keys = all.map(s => s.keys.join(' '))
    expect(keys).toEqual(expect.arrayContaining(['?', '1', '2', '3', 'j', 'k', 'Esc']))
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title).toBeTruthy()
      expect(group.shortcuts.length).toBeGreaterThan(0)
      for (const s of group.shortcuts) expect(s.description).toBeTruthy()
    }
  })
})
