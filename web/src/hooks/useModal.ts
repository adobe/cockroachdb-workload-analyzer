// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

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

interface Options {
  // Falsy while closed. A change of value while open re-runs the focus
  // management, so the drawer refocuses when it switches fingerprint.
  openKey: string | boolean | null
  onClose: () => void
  // Receives focus when the modal opens.
  closeRef: RefObject<HTMLElement | null>
  // When given, Tab cycles inside this element while the modal is open.
  trapRef?: RefObject<HTMLElement | null>
}

// The focus and keyboard contract shared by the fingerprint drawer and the
// shortcuts dialog: on open, remember what was focused and move focus to the
// close button; on close, restore it to the trigger. Escape closes. Both are
// handled at the document level: clicking non-focusable text in the modal
// drops focus to body, where a keydown never reaches a React handler on the
// modal itself.
export function useModal({ openKey, onClose, closeRef, trapRef }: Options): void {
  // Read through a ref so the document listener binds once per open rather
  // than on every render of a parent passing an inline onClose.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!openKey) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
      } else if (e.key === 'Tab' && trapRef) {
        trapTab(e, trapRef.current)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openKey, trapRef])

  useEffect(() => {
    if (!openKey) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus?.()
  }, [openKey, closeRef])
}
