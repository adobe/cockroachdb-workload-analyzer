// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useEffect, useState } from 'react'
import { fetchSchema } from '../../api'
import type { SchemaResult } from '../../api'

export function SchemaTab() {
  const [schema, setSchema] = useState<SchemaResult | null>(null)
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    fetchSchema().then(s => {
      setSchema(s)
      const first = Object.keys(s.databases)[0]
      if (first) setSelected(first)
    }).catch(() => {})
  }, [])

  const databases = schema ? Object.keys(schema.databases).sort() : []

  return (
    <div className="schema-tab">
      <div className="schema-toolbar">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="schema-select"
          aria-label="Select database schema"
        >
          {databases.map(db => <option key={db} value={db}>{db}</option>)}
        </select>
      </div>
      <pre className="schema-content">
        {schema?.databases[selected] ?? 'Loading...'}
      </pre>
    </div>
  )
}
