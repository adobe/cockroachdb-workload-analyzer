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
import { ResultsTable } from '../ResultsTable'

interface QueryWithSQL extends QueryDef {
  sql: string
  db_filter_expr?: string
}

interface PanelProps {
  query: QueryWithSQL
  db: string
  onFingerprintClick?: (id: string) => void
}

// IndexQueryPanel is mounted with a key of `${query.id}-${db}` so a db change
// remounts it with fresh initial state (loading=true) rather than resetting
// state synchronously inside an effect.
function IndexQueryPanel({ query, db, onFingerprintClick }: PanelProps) {
  const [result, setResult] = useState<RunResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    runCatalogQuery(query.id, db)
      .then(r => { if (!ignore) setResult(r) })
      .catch(() => {})
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [query.id, db])

  return (
    <div className="index-panel">
      <div className="index-panel-header">
        <h3>{query.name}</h3>
        <p>{query.description}</p>
        {!query.db_filter_expr && (
          <p className="index-unfiltered-note">⚠️ Index tables don't carry database attribution — showing all.</p>
        )}
      </div>
      <ResultsTable result={result} loading={loading} onFingerprintClick={onFingerprintClick} />
    </div>
  )
}

interface Props {
  indexQueries: QueryDef[]
  selectedDb: string
  onFingerprintClick?: (id: string) => void
}

export function IndexesTab(props: Props) {
  const { selectedDb, onFingerprintClick } = props
  const [queries, setQueries] = useState<QueryWithSQL[]>([])

  useEffect(() => {
    fetch('/api/queries?full=1')
      .then(r => r.json())
      .then((all: QueryWithSQL[]) =>
        setQueries(all.filter(q => q.category === 'Indexes'))
      )
      .catch(() => {})
  }, [])

  if (queries.length === 0) return <div className="results-state">Loading index data...</div>

  return (
    <div className="indexes-tab">
      {queries.map(q => {
        // Non-filterable queries ignore the selected database, so keep their db
        // key empty to avoid needless remounts/refetches when it changes.
        const db = q.db_filter_expr ? selectedDb : ''
        return (
          <IndexQueryPanel
            key={`${q.id}-${db}`}
            query={q}
            db={db}
            onFingerprintClick={onFingerprintClick}
          />
        )
      })}
    </div>
  )
}
