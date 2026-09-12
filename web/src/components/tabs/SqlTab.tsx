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
import { useRun } from '../../hooks/useRun'
import { editorFontOptions, ensureMonacoTheme } from '../../monacoThemes'
import type { QueryDef } from '../../api'
import type { ThemeName } from '../../theme'

const DEFAULT_SQL = '-- Write your SQL here\n-- Ctrl+Enter or Cmd+Enter to run\nSELECT * FROM stmt_stats LIMIT 10'

function editorOptions() {
  return {
    minimap: { enabled: false },
    ...editorFontOptions(),
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
  }
}

interface Props {
  queries: QueryDef[]
  theme: ThemeName
  onFingerprintClick?: (id: string) => void
}

export function SqlTab({ queries, theme, onFingerprintClick }: Props) {
  const { result, loading, run } = useRun()
  // Lazily initialized so the first mount reads fresh tokens (data-theme is
  // already set by then, via the bootstrap script or useTheme's layout
  // effect). Re-registered in a passive effect on theme change, after
  // useTheme's layout effect has flipped data-theme for the new theme, so
  // this never reads stale colors.
  //
  // Kept in state rather than derived in render: MonacoEditor is a child of
  // SqlTab, so its own `[theme]` effect (which calls monaco.editor.setTheme)
  // runs before this effect does. If the theme name were computed directly
  // in render instead, MonacoEditor would receive it immediately — before
  // ensureMonacoTheme had registered it — and call setTheme with an unknown
  // name; Monaco silently falls back to its default and nothing ever calls
  // setTheme again. Holding the name in state guarantees MonacoEditor only
  // sees it on the render after registration has happened.
  const [monacoTheme, setMonacoTheme] = useState(() => ensureMonacoTheme(theme))
  useEffect(() => {
    // ensureMonacoTheme is a call into an external system (it registers a
    // theme in Monaco's global registry from current computed-style tokens);
    // mirroring its return value into state is the effect synchronizing with
    // that system, not a derivable-in-render value. Computing it in render
    // instead would reintroduce the bug this effect fixes: render runs
    // before useTheme's layout effect flips data-theme for the new theme.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonacoTheme(ensureMonacoTheme(theme))
  }, [theme])
  const editorRef = useRef<{
    getValue: () => string
    setValue: (v: string) => void
    addCommand: (keybinding: number, handler: () => void) => void
  } | null>(null)

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
        <QueryList queries={queries} activeId={null} onSelect={handleInsert} />
      </div>
      <div className="sql-editor-column">
        <div className="sql-editor-area">
          <MonacoEditor
            defaultLanguage="sql"
            defaultValue={DEFAULT_SQL}
            theme={monacoTheme}
            onMount={handleMount}
            options={editorOptions()}
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
