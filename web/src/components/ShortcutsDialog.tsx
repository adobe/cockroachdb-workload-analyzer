// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { Fragment, useEffect, useRef } from 'react'
import { SHORTCUT_GROUPS } from '../shortcuts'

interface Props {
  open: boolean
  onClose: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps Tab inside the dialog: wraps at either end, and pulls focus back to
// the first (or, on Shift+Tab, last) focusable when focus is outside it.
function trapTab(e: KeyboardEvent, dialog: HTMLElement | null) {
  if (!dialog) return
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const inside = active instanceof HTMLElement && dialog.contains(active)
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault()
    first.focus()
  }
}

// A modal listing every keyboard shortcut. Follows the same focus contract as
// the fingerprint drawer: focus moves to the close button on open and returns
// to the trigger on close; Escape, the close button and the backdrop all close
// it; Tab cycles inside the dialog while it is open.
export function ShortcutsDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  // Read through a ref so the document listener binds once per open rather
  // than on every render of a parent passing an inline onClose.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Escape and the Tab trap are handled at the document level: clicking
  // non-focusable text in the dialog drops focus to body, where a keydown
  // never reaches a React handler on the dialog itself.
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
      } else if (e.key === 'Tab') {
        trapTab(e, dialogRef.current)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => prevFocusRef.current?.focus?.()
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" data-testid="shortcuts-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="drawer-header">
          <h2 id="shortcuts-title" className="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={closeRef} className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map(group => (
            <section key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <dl className="shortcuts-list">
                {group.shortcuts.map(s => (
                  <div key={s.description}>
                    <dt>
                      {s.keys.map((alt, i) => (
                        <Fragment key={alt}>
                          {i > 0 && <span className="shortcuts-sep">or</span>}
                          {alt.split('+').map((part, j) => (
                            <Fragment key={part}>
                              {j > 0 && <span className="shortcuts-sep">+</span>}
                              <kbd>{part}</kbd>
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </dt>
                    <dd>{s.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
