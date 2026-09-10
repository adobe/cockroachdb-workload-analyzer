// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'wa.drawerWidth'
const DEFAULT_WIDTH = 400
const MIN_WIDTH = 320

// clampDrawerWidth keeps the drawer between a usable minimum and 90% of the
// viewport, so a drag can't shrink it to nothing or cover the whole screen.
export function clampDrawerWidth(px: number, viewport: number): number {
  const max = Math.max(MIN_WIDTH, Math.floor(viewport * 0.9))
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(px)))
}

function viewportWidth(): number {
  return typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1600
}

// localStorage may be absent (test env, privacy modes) — degrade gracefully.
function loadWidth(): number {
  try {
    const saved = Number(globalThis.localStorage?.getItem(STORAGE_KEY))
    return saved ? clampDrawerWidth(saved, viewportWidth()) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

function saveWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(width))
  } catch {
    // ignore persistence failures
  }
}

// useDrawerWidth tracks the drawer's width, persists it to localStorage, and
// returns a pointer-down handler that resizes by dragging the left edge (the
// drawer is anchored right, so width = viewport - pointer x).
export function useDrawerWidth() {
  const [width, setWidth] = useState<number>(loadWidth)

  useEffect(() => {
    saveWidth(width)
  }, [width])

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const onMove = (ev: PointerEvent) => {
      setWidth(clampDrawerWidth(window.innerWidth - ev.clientX, window.innerWidth))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
    // Suppress text selection while dragging.
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [setWidth])

  return { width, startResize }
}
