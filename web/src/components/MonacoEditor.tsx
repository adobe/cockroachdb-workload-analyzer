// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useEffect, useRef } from 'react'
// Import monaco's core API plus only the SQL syntax contribution instead of
// the package root (editor.main), which would also bundle the TypeScript,
// CSS, HTML, and JSON language services, their workers, and ~70 unused
// language chunks — roughly 9 MB of dead weight in the embedded binary
// (enforced by TestEmbeddedAssetsWithinSizeBudget in static_test.go).
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/sql/register.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'

// Thin wrapper around the bundled monaco-editor package instead of
// @monaco-editor/react, whose loader fetches monaco from cdn.jsdelivr.net at
// runtime — a network dependency this tool must not have: it runs against
// production workload data and must work air-gapped. Bundling keeps every
// byte of editor code inside the Go binary (enforced by
// TestEmbeddedAssetsHaveNoCDNReferences in static_test.go).
//
// SQL highlighting has no dedicated language worker; only the base editor
// worker is needed.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
}

interface Props {
  defaultLanguage: string
  defaultValue: string
  theme?: string
  options?: monaco.editor.IStandaloneEditorConstructionOptions
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void
}

export function MonacoEditor({ defaultLanguage, defaultValue, theme, options, onMount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // All props except `theme` are initial-only (mirroring @monaco-editor/react's
  // default* semantics): the editor is created once on mount and owns its
  // state from then on, so later prop changes are intentionally ignored.
  useEffect(() => {
    const editor = monaco.editor.create(containerRef.current!, {
      value: defaultValue,
      language: defaultLanguage,
      theme,
      automaticLayout: true,
      ...options,
    })
    onMount?.(editor)
    return () => editor.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design, see above
  }, [])

  // Theme is the one prop that is not initial-only: Monaco themes are global,
  // so switching the UI theme must retint an already-mounted editor.
  useEffect(() => {
    if (theme) monaco.editor.setTheme(theme)
  }, [theme])

  return <div ref={containerRef} className="monaco-editor-container" style={{ width: '100%', height: '100%' }} />
}
