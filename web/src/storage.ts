// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// localStorage may be absent, or the accessor itself may throw (Chrome raises
// SecurityError on window.localStorage when site data is blocked; some private
// modes do the same), and getItem/setItem can throw on their own. Every
// persisted preference goes through these two guards so no caller re-derives
// the pattern.

export function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readItem(key: string): string | null {
  try {
    return safeLocalStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

// A null value removes the key.
export function writeItem(key: string, value: string | null): void {
  try {
    const storage = safeLocalStorage()
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch {
    // ignore persistence failures
  }
}
