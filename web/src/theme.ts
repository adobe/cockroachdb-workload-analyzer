// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// Theme resolution shared by the useTheme hook and (by hand-copied logic)
// the inline bootstrap script in index.html. Keep the two in sync: the
// useTheme test evaluates the inline script against resolveTheme.

export const THEMES = ['dark', 'light', 'dark-hc', 'light-hc'] as const
export type ThemeName = (typeof THEMES)[number]

export const PREFERENCES = ['system', ...THEMES] as const
export type ThemePreference = (typeof PREFERENCES)[number]

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Follow system',
  dark: 'Dark',
  light: 'Light',
  'dark-hc': 'Dark high contrast',
  'light-hc': 'Light high contrast',
}

export const STORAGE_KEY = 'wa.theme'
export const LIGHT_QUERY = '(prefers-color-scheme: light)'
export const CONTRAST_QUERY = '(prefers-contrast: more)'

export type Matches = (query: string) => boolean

export function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v)
}

// Dark is the default when the OS states no preference, matching the tool's
// original look.
export function systemTheme(matches: Matches): ThemeName {
  const base = matches(LIGHT_QUERY) ? 'light' : 'dark'
  return matches(CONTRAST_QUERY) ? `${base}-hc` : base
}

export function resolveTheme(preference: ThemePreference, matches: Matches): ThemeName {
  return preference === 'system' ? systemTheme(matches) : preference
}

// localStorage may be absent or throw (privacy modes, tests) — degrade to
// "follow system".
export function readPreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    const v = storage?.getItem(STORAGE_KEY)
    return isThemeName(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

export function writePreference(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  preference: ThemePreference,
): void {
  try {
    if (preference === 'system') storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, preference)
  } catch {
    // ignore persistence failures
  }
}

export function applyTheme(root: HTMLElement, theme: ThemeName): void {
  root.dataset.theme = theme
  root.style.colorScheme = theme.startsWith('dark') ? 'dark' : 'light'
}
