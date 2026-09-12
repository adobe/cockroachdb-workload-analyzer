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
import {
  applyTheme, readPreference, systemTheme, writePreference,
  CONTRAST_QUERY, LIGHT_QUERY,
} from '../theme'
import type { ThemeName, ThemePreference } from '../theme'

function mediaMatches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

// useTheme resolves the active theme (stored preference first, then the OS),
// applies it to <html>, and keeps following OS changes only while the
// preference is "system".
export function useTheme(): {
  theme: ThemeName
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference(globalThis.localStorage))
  const [system, setSystem] = useState<ThemeName>(() => systemTheme(mediaMatches))

  useEffect(() => {
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return
    const update = () => setSystem(systemTheme(mediaMatches))
    update()
    const lists = [LIGHT_QUERY, CONTRAST_QUERY].map(q => window.matchMedia(q))
    for (const l of lists) l.addEventListener('change', update)
    return () => {
      for (const l of lists) l.removeEventListener('change', update)
    }
  }, [preference])

  const theme: ThemeName = preference === 'system' ? system : preference

  useEffect(() => {
    applyTheme(document.documentElement, theme)
  }, [theme])

  const setPreference = useCallback((p: ThemePreference) => {
    writePreference(globalThis.localStorage, p)
    setPreferenceState(p)
  }, [])

  return { theme, preference, setPreference }
}
