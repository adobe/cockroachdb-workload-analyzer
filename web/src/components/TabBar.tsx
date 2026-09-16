// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { tabId, tabPanelId } from '../tabIds'

export interface TabDef<T extends string> {
  id: T
  label: string
}

interface Props<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
  // Rendered after the tabs, inside the bar (the database picker).
  children?: ReactNode
}

// WAI-ARIA tabs with automatic activation: a single tab stop (the selected
// tab), Left/Right to move with wrap-around, Home/End to jump. Moving focus
// selects, since switching tabs is cheap and non-destructive.
export function TabBar<T extends string>({ tabs, active, onChange, children }: Props<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>())

  function handleKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const index = tabs.findIndex(t => t.id === active)
    if (index === -1) return
    let next: number
    switch (e.key) {
      case 'ArrowRight': next = (index + 1) % tabs.length; break
      case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break
      case 'Home': next = 0; break
      case 'End': next = tabs.length - 1; break
      default: return
    }
    e.preventDefault()
    const id = tabs[next].id
    onChange(id)
    refs.current.get(id)?.focus()
  }

  return (
    <nav className="tab-bar">
      <div role="tablist" className="tab-list" onKeyDown={handleKeyDown}>
        {tabs.map(t => (
          <button
            key={t.id}
            ref={el => {
              if (el) refs.current.set(t.id, el)
              else refs.current.delete(t.id)
            }}
            id={tabId(t.id)}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={tabPanelId(t.id)}
            tabIndex={active === t.id ? 0 : -1}
            className={`tab-btn${active === t.id ? ' active' : ''}`}
            // Explicit focus: Safari and Firefox on macOS do not focus a
            // button on click, which would leave the arrow keys with no tab.
            onClick={e => {
              onChange(t.id)
              e.currentTarget.focus()
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </nav>
  )
}
