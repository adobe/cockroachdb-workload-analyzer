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
import { fetchMeta, fetchQueries, fetchDatabases } from './api'
import type { MetaResult, QueryDef } from './api'
import { LoadingScreen } from './components/LoadingScreen'
import { MetaBar } from './components/MetaBar'
import { DatabasePicker } from './components/DatabasePicker'
import { FingerprintDrawer } from './components/FingerprintDrawer'
import { MissingTablesBanner } from './components/MissingTablesBanner'
import { useStatus } from './hooks/useStatus'
import { AnalysisTab } from './components/tabs/AnalysisTab'
import { SqlTab } from './components/tabs/SqlTab'
import { SchemaTab } from './components/tabs/SchemaTab'

type Tab = 'analysis' | 'sql' | 'schema'

export default function App() {
  const status = useStatus()
  const [tab, setTab] = useState<Tab>('analysis')
  const [meta, setMeta] = useState<MetaResult | null>(null)
  const [queries, setQueries] = useState<QueryDef[]>([])
  const [selectedDb, setSelectedDb] = useState('')
  const [databases, setDatabases] = useState<string[]>([])
  const [clickedFingerprint, setClickedFingerprint] = useState<string | null>(null)

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => {})
    fetchQueries().then(setQueries).catch(() => {})
  }, [])

  useEffect(() => {
    if (status.state === 'ready') {
      fetchDatabases().then(setDatabases).catch(() => {})
    }
  }, [status.state])

  if (status.state === 'loading') {
    return (
      <div className="app">
        <MetaBar meta={meta} filename="workload export" />
        <LoadingScreen status={status} />
      </div>
    )
  }

  return (
    <div className="app">
      <MetaBar meta={meta} filename="workload export" />
      <MissingTablesBanner tables={status.tables} />
      <nav className="tab-bar">
        {(['analysis', 'sql', 'schema'] as Tab[]).map(t => (
          <button
            key={t}
            className={`tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {databases.length > 0 && tab !== 'schema' && (
          <DatabasePicker databases={databases} selected={selectedDb} onSelect={setSelectedDb} />
        )}
      </nav>
      <main className="tab-content">
        {tab === 'analysis' && (
          <AnalysisTab
            queries={queries}
            selectedDb={selectedDb}
            onFingerprintClick={setClickedFingerprint}
          />
        )}
        {tab === 'sql' && <SqlTab onFingerprintClick={setClickedFingerprint} />}
        {tab === 'schema' && <SchemaTab />}
      </main>
      <FingerprintDrawer
        fingerprint={clickedFingerprint}
        onClose={() => setClickedFingerprint(null)}
      />
    </div>
  )
}
