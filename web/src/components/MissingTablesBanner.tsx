// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useState } from 'react'
import type { TableEntry } from '../api'

// MissingTablesBanner surfaces the export tables the loader couldn't load, so a
// user understands why some queries return "not in this export". Covers both
// tables absent from the export (application-VC exports omit node/gossip tables)
// and tables that errored during load.
export function MissingTablesBanner({ tables }: { tables: TableEntry[] }) {
  const [dismissed, setDismissed] = useState(false)
  const missing = tables.filter(t => !t.loaded)
  if (dismissed || missing.length === 0) return null

  return (
    <div className="missing-banner" role="status">
      <span className="missing-banner-text">
        {missing.length} {missing.length === 1 ? 'table' : 'tables'} not loaded from this export:{' '}
        {missing.map((t, i) => (
          <span key={t.name}>
            <code>{t.name}</code>
            {t.error ? <span className="missing-banner-reason"> ({t.error})</span> : null}
            {i < missing.length - 1 ? ', ' : ''}
          </span>
        ))}
        . Queries against them will be unavailable.
      </span>
      <button
        className="missing-banner-close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
