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
import { isEditableTarget, isModalOpen } from '../shortcuts'

interface Handlers {
  // Called with the 0-based tab index for the digit keys 1..9.
  onTab: (index: number) => void
  onHelp: () => void
}

// Page-wide single-key shortcuts: digits switch tabs, "?" opens the help
// dialog. Ignored while typing and while a modal is open, and never with a
// modifier held (Ctrl+1 is the browser's own tab switch). The query list's
// j/k shortcut lives in QueryList so the list logic stays in one place.
export function useGlobalShortcuts(handlers: Handlers) {
  // The listener is bound once; it reads the latest handlers through a ref
  // that is synced after each render, so callers can pass inline closures.
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return
      if (isEditableTarget(e.target) || isModalOpen()) return
      if (e.key === '?') {
        e.preventDefault()
        ref.current.onHelp()
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        ref.current.onTab(Number(e.key) - 1)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
