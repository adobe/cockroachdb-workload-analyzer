// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { vi } from 'vitest'

type Listener = (ev: { matches: boolean }) => void

// jsdom has no matchMedia. This installs a controllable one: `set` flips a
// query and notifies listeners, the way a real OS change would.
export function installMatchMedia(initial: string[] = []) {
  const matching = new Set(initial)
  const listeners = new Map<string, Set<Listener>>()

  window.matchMedia = vi.fn((query: string) => {
    const set = listeners.get(query) ?? new Set<Listener>()
    listeners.set(query, set)
    return {
      get matches() { return matching.has(query) },
      media: query,
      addEventListener: (_type: string, l: Listener) => { set.add(l) },
      removeEventListener: (_type: string, l: Listener) => { set.delete(l) },
    }
  }) as unknown as typeof window.matchMedia

  return {
    set(query: string, matches: boolean) {
      if (matches) matching.add(query)
      else matching.delete(query)
      for (const l of listeners.get(query) ?? []) l({ matches })
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0
    },
  }
}
