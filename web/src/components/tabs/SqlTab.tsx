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
import { MonacoEditor } from '../MonacoEditor'
import { ResultsTable } from '../ResultsTable'
import { QueryList } from '../QueryList'
import { ErrorBanner } from '../ErrorBanner'
import { useRun } from '../../hooks/useRun'
import { fetchQueriesFull } from '../../api'
import type { QueryDefFull } from '../../api'

const DEFAULT_SQL = '-- Write your SQL here\n-- Ctrl+Enter or Cmd+Enter to run\nSELECT * FROM stmt_stats LIMIT 10'

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
}

interface Props {
  onFingerprintClick?: (id: string) => void
}

export function SqlTab({ onFingerprintClick }: Props) {
  const { result, loading, run } = useRun()
  const editorRef = useRef<{
    getValue: () => string
    setValue: (v: string) => void
    addCommand: (keybinding: number, handler: () => void) => void
  } | null>(null)
  const [queries, setQueries] = useState<QueryDefFull[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchQueriesFull()
      .then(qs => {
        setQueries(qs)
        setError(null)
      })
      .catch(err => {
        console.error(err)
        setError("Couldn't load the saved queries. The server may be unavailable — try reloading.")
      })
  }, [])

  const handleMount = useCallback((editor: {
    getValue: () => string
    setValue: (v: string) => void
    addCommand: (keybinding: number, handler: () => void) => void
  }) => {
    editorRef.current = editor

    editor.addCommand(
      // Monaco keycodes: CtrlCmd = 2048, Enter = 3
      2048 | 3,
      () => {
        const sql = editor.getValue().trim()
        if (sql) run(sql)
      }
    )
  }, [run])

  function handleRunClick() {
    const sql = editorRef.current?.getValue().trim()
    if (sql) run(sql)
  }

  function handleInsert(id: string) {
    const query = queries.find(q => q.id === id)
    if (!query || !editorRef.current) return
    const current = editorRef.current.getValue()
    editorRef.current.setValue(current + '\n\n-- ' + query.name + '\n' + query.sql)
  }

  return (
    <div className="sql-tab">
      <div className="sql-sidebar">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <QueryList queries={queries} activeId={null} onSelect={handleInsert} />
      </div>
      <div className="sql-editor-column">
        <div className="sql-editor-area">
          <MonacoEditor
            defaultLanguage="sql"
            defaultValue={DEFAULT_SQL}
            theme="vs-dark"
            onMount={handleMount}
            options={EDITOR_OPTIONS}
          />
          <div className="sql-toolbar">
            <button className="run-btn" onClick={handleRunClick} disabled={loading}>
              {loading ? 'Running...' : '▶ Run (⌘↵)'}
            </button>
          </div>
        </div>
        <div className="sql-results">
          <ResultsTable result={result} loading={loading} onFingerprintClick={onFingerprintClick} />
        </div>
      </div>
    </div>
  )
}
