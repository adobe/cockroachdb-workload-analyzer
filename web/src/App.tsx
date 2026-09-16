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
import { ErrorBanner } from './components/ErrorBanner'
import { useStatus } from './hooks/useStatus'
import { useSchema } from './hooks/useSchema'
import { useTheme } from './hooks/useTheme'
import { ThemeSelect } from './components/ThemeSelect'
import { TabBar } from './components/TabBar'
import { TABS, tabId, tabPanelId } from './tabIds'
import type { Tab } from './tabIds'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { AnalysisTab } from './components/tabs/AnalysisTab'
import { SqlTab } from './components/tabs/SqlTab'
import { SchemaTab } from './components/tabs/SchemaTab'

export default function App() {
  const status = useStatus()
  const { theme, preference, setPreference } = useTheme()
  const [tab, setTab] = useState<Tab>('analysis')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  useGlobalShortcuts({
    onTab: i => {
      if (!TABS[i]) return
      setTab(TABS[i].id)
      // Also move focus to the tab, so Left/Right and Home/End work next.
      // The digit is handled page-wide, so nothing in the tab bar has focus.
      document.getElementById(tabId(TABS[i].id))?.focus()
    },
    onHelp: () => setShortcutsOpen(true),
  })
  const [meta, setMeta] = useState<MetaResult | null>(null)
  const [queries, setQueries] = useState<QueryDef[]>([])
  const [selectedDb, setSelectedDb] = useState('')
  const [databases, setDatabases] = useState<string[]>([])
  const [clickedFingerprint, setClickedFingerprint] = useState<string | null>(null)
  const [queriesError, setQueriesError] = useState<string | null>(null)
  const [databasesError, setDatabasesError] = useState<string | null>(null)
  // Fetched lazily the first time the Schema tab opens; its picker shares the
  // tab-bar slot with the statistics filter but keeps its own list and choice.
  const schema = useSchema(tab === 'schema')

  // The query catalog is fetched once here and passed to both the Analysis and
  // SQL tabs. Owning it in App means switching tabs never refetches it, and a
  // single banner covers the failure instead of one per tab.
  useEffect(() => {
    fetchMeta().then(setMeta).catch(err => {
      // Meta is decorative (the top bar); don't block the app on it.
      console.error(err)
    })
    fetchQueries()
      .then(qs => {
        setQueries(qs)
        setQueriesError(null)
      })
      .catch(err => {
        console.error(err)
        setQueriesError("Couldn't load the analysis queries. The server may be unavailable — try reloading.")
      })
  }, [])

  useEffect(() => {
    if (status.state === 'ready') {
      fetchDatabases()
        .then(dbs => {
          setDatabases(dbs)
          setDatabasesError(null)
        })
        .catch(err => {
          console.error(err)
          setDatabasesError("Couldn't load the database list. The server may be unavailable — try reloading.")
        })
    }
  }, [status.state])

  if (status.state === 'loading') {
    return (
      <div className="app">
        <MetaBar meta={meta} filename="workload export">
          <ThemeSelect preference={preference} theme={theme} onChange={setPreference} />
        </MetaBar>
        <LoadingScreen status={status} />
      </div>
    )
  }

  // The query and database loads share one banner. Each keeps its own error
  // state (so a later success clears only its own message), but we render a
  // single alert: the specific message when one fails, a merged one when both
  // do — rather than stacking two near-identical "server unavailable" banners.
  const loadError =
    queriesError && databasesError
      ? "Couldn't load the analysis queries or the database list. The server may be unavailable — try reloading."
      : queriesError ?? databasesError
  const dismissLoadError = () => {
    setQueriesError(null)
    setDatabasesError(null)
  }

  return (
    <div className="app">
      <MetaBar meta={meta} filename="workload export">
        <button
          className="shortcuts-btn"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <kbd>?</kbd>
        </button>
        <ThemeSelect preference={preference} theme={theme} onChange={setPreference} />
      </MetaBar>
      <ErrorBanner message={loadError} onDismiss={dismissLoadError} />
      <MissingTablesBanner tables={status.tables} />
      <TabBar tabs={TABS} active={tab} onChange={setTab}>
        {tab === 'schema' ? (
          schema.databases.length > 0 && (
            <DatabasePicker
              databases={schema.databases}
              selected={schema.selected}
              onSelect={schema.setSelected}
              allowAll={false}
              ariaLabel="Select database schema"
            />
          )
        ) : (
          databases.length > 0 && (
            <DatabasePicker databases={databases} selected={selectedDb} onSelect={setSelectedDb} />
          )
        )}
      </TabBar>
      <main className="tab-content">
        {/* The panel is a child of main rather than main itself, so the page
            keeps its main landmark alongside the tabpanel role. */}
        <div className="tab-panel" role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)}>
          {tab === 'analysis' && (
            <AnalysisTab
              queries={queries}
              selectedDb={selectedDb}
              onFingerprintClick={setClickedFingerprint}
            />
          )}
          {tab === 'sql' && <SqlTab queries={queries} theme={theme} onFingerprintClick={setClickedFingerprint} />}
          {tab === 'schema' && (
            <SchemaTab ddl={schema.ddl} error={schema.error} onDismissError={schema.dismissError} />
          )}
        </div>
      </main>
      <FingerprintDrawer
        fingerprint={clickedFingerprint}
        onClose={() => setClickedFingerprint(null)}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
