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
import type { QueryDef, RunResult } from '../../api'
import { runCatalogQuery } from '../../api'
import { QueryList } from '../QueryList'
import { ResultsTable } from '../ResultsTable'

interface Props {
  queries: QueryDef[]
  selectedDb: string
  onFingerprintClick?: (id: string) => void
}

// QueryResult fetches and renders a single catalog query. It is mounted with a
// key of `${queryId}-${db}` so a query/db change remounts it with fresh initial
// state instead of resetting state synchronously inside an effect.
function QueryResult({
  queryId,
  db,
  onFingerprintClick,
}: {
  queryId: string
  db: string
  onFingerprintClick?: (id: string) => void
}) {
  const [result, setResult] = useState<RunResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    runCatalogQuery(queryId, db)
      .then(r => { if (!ignore) setResult(r) })
      .catch(err => {
        // Surface the failure through ResultsTable's error state rather than
        // rendering an indistinguishable "No results".
        console.error(err)
        if (!ignore) setResult({ columns: [], rows: [], duration_ms: 0, error: 'Query failed to run. The server may be unavailable — try reloading.' })
      })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [queryId, db])

  return <ResultsTable result={result} loading={loading} onFingerprintClick={onFingerprintClick} />
}

export function AnalysisTab({ queries, selectedDb, onFingerprintClick }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = queries.find(q => q.id === activeId)
  // Non-filterable queries ignore the selected database, so they should not
  // refetch (remount) when it changes.
  const effectiveDb = active?.db_filter_expr ? selectedDb : ''

  return (
    <div className="analysis-tab">
      <QueryList
        queries={queries}
        activeId={activeId}
        onSelect={setActiveId}
        activation="automatic"
      />
      <div className="analysis-main">
        {active && (
          <div className="analysis-header">
            <h3>{active.name}</h3>
            <p className="analysis-desc">{active.description}</p>
            {selectedDb && !active.db_filter_expr && (
              <p className="index-unfiltered-note">⚠️ This query doesn't support database filtering — showing all.</p>
            )}
          </div>
        )}
        {activeId ? (
          <QueryResult
            key={`${activeId}-${effectiveDb}`}
            queryId={activeId}
            db={selectedDb}
            onFingerprintClick={onFingerprintClick}
          />
        ) : (
          <ResultsTable result={null} loading={false} onFingerprintClick={onFingerprintClick} />
        )}
      </div>
    </div>
  )
}
