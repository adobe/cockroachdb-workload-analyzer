// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSchema } from '../api'
import type { SchemaResult } from '../api'

// useSchema owns the schema export for the Schema tab: it fetches once, the
// first time `enabled` is true (i.e. the tab is opened), and tracks which
// database's DDL is shown. App owns it so the database picker can live in
// the tab bar alongside the picker used by the other tabs.
export function useSchema(enabled: boolean): {
  databases: string[]
  selected: string
  setSelected: (db: string) => void
  ddl: string | null
  error: string | null
  dismissError: () => void
} {
  const [schema, setSchema] = useState<SchemaResult | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  // A ref, not state: it is a fetch-once latch and must not trigger a render.
  const requested = useRef(false)

  useEffect(() => {
    if (!enabled || requested.current) return
    requested.current = true
    fetchSchema()
      .then(s => {
        setSchema(s)
        setError(null)
        const first = Object.keys(s.databases).sort()[0]
        if (first) setSelected(first)
      })
      .catch(err => {
        console.error(err)
        setError("Couldn't load the schema. The server may be unavailable — try reloading.")
      })
  }, [enabled])

  const dismissError = useCallback(() => setError(null), [])

  return {
    databases: schema ? Object.keys(schema.databases).sort() : [],
    selected,
    setSelected,
    ddl: schema?.databases[selected] ?? null,
    error,
    dismissError,
  }
}
