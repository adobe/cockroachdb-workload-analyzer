// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { QueryDef } from '../api'
import { isEditableTarget, isModalOpen } from '../shortcuts'

interface Props {
  queries: QueryDef[]
  activeId: string | null
  onSelect: (id: string) => void
  // "automatic": moving the keyboard cursor selects the query (Analysis, where
  // selecting just shows results). "manual": moving only highlights; Enter or
  // Space selects (SQL, where selecting appends to the editor).
  activation?: 'automatic' | 'manual'
}

// Keys handled while focus is inside the list. ArrowUp/ArrowDown and Home/End
// follow the WAI-ARIA listbox pattern; j/k are additionally bound globally.
function stepFor(key: string, index: number, last: number): number | null {
  switch (key) {
    case 'ArrowDown': case 'j': return Math.min(index + 1, last)
    case 'ArrowUp': case 'k': return Math.max(index - 1, 0)
    case 'Home': return 0
    case 'End': return last
    default: return null
  }
}

export function QueryList({ queries, activeId, onSelect, activation = 'manual' }: Props) {
  // Grouped by category in first-seen order. The list renders in this grouped
  // order, so keyboard order is the grouped order, not the catalog order.
  const groups = new Map<string, QueryDef[]>()
  for (const q of queries) groups.set(q.category, [...(groups.get(q.category) ?? []), q])
  const ordered = [...groups.values()].flat()
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())

  // Roving tabindex: exactly one item is tabbable. It is the item the keyboard
  // cursor last rested on, else the active query, else the first one. The
  // highlighted item (cursor or active) is tracked separately: when neither
  // exists nothing is highlighted, and a page-wide j/k must land on the first
  // query rather than step past it.
  const [cursorId, setCursorId] = useState<string | null>(null)
  const highlightedId =
    (cursorId && ordered.some(q => q.id === cursorId) ? cursorId : null) ??
    (activeId && ordered.some(q => q.id === activeId) ? activeId : null)
  const tabbableId = highlightedId ?? ordered[0]?.id ?? null

  function moveTo(id: string) {
    setCursorId(id)
    itemRefs.current.get(id)?.focus()
    if (activation === 'automatic') onSelect(id)
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const focusedId = (e.target as HTMLElement).dataset.queryId
    const index = ordered.findIndex(q => q.id === focusedId)
    if (index === -1) return
    const next = stepFor(e.key, index, ordered.length - 1)
    if (next === null) return
    e.preventDefault()
    if (ordered[next].id !== focusedId) moveTo(ordered[next].id)
  }

  // j/k work from anywhere on the page (like the digit tab shortcuts), stepping
  // from the highlighted item, or onto the first item when there is none. The
  // listener is bound once and reads the latest list state through a ref
  // synced after each render.
  const globalRef = useRef({ ordered, highlightedId, moveTo })
  useEffect(() => {
    globalRef.current = { ordered, highlightedId, moveTo }
  })
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'j' && e.key !== 'k') return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (isEditableTarget(e.target) || isModalOpen()) return
      const { ordered, highlightedId, moveTo } = globalRef.current
      if (ordered.length === 0) return
      // A focused list item already handled this key in handleKeyDown.
      if (e.defaultPrevented) return
      // -1 when nothing is highlighted, so both j and k land on index 0.
      const index = ordered.findIndex(q => q.id === highlightedId)
      const next = stepFor(e.key, index, ordered.length - 1)!
      e.preventDefault()
      if (ordered[next].id !== highlightedId) moveTo(ordered[next].id)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <nav className="query-list" aria-label="Queries" onKeyDown={handleKeyDown}>
      {[...groups].map(([cat, items]) => (
        <div key={cat} className="query-category">
          <div className="query-category-label">{cat}</div>
          {items.map(q => (
            <button
              key={q.id}
              ref={el => {
                if (el) itemRefs.current.set(q.id, el)
                else itemRefs.current.delete(q.id)
              }}
              data-query-id={q.id}
              className={`query-item${activeId === q.id ? ' active' : ''}`}
              tabIndex={tabbableId === q.id ? 0 : -1}
              aria-current={activeId === q.id ? 'true' : undefined}
              onFocus={() => setCursorId(q.id)}
              // Explicit focus: Safari and Firefox on macOS do not focus a
              // button on click, so the cursor would not follow the click.
              onClick={e => {
                onSelect(q.id)
                e.currentTarget.focus()
              }}
            >
              {q.name}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
