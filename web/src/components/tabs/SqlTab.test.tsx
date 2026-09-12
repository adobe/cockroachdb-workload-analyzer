// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SqlTab } from './SqlTab'
import { MonacoEditor } from '../MonacoEditor'
import type { QueryDef } from '../../api'

// The query catalog is now owned by App and passed in via props, so SqlTab no
// longer fetches it (or surfaces a load error — App does).
const queries: QueryDef[] = [
  {
    id: 'stmt-top-cpu',
    category: 'Statements',
    name: 'Top CPU Consumers',
    description: 'Top CPU',
    sql: 'SELECT cpu FROM stmt_stats LIMIT 25',
    db_filter_expr: "json_extract_string(metadata, '$.db')",
  },
]

const mockEditor = {
  getValue: vi.fn().mockReturnValue('SELECT 0'),
  setValue: vi.fn(),
  addCommand: vi.fn(),
}

// When false, the mock behaves like an editor that never finished mounting
// (the real component fires onMount only from a mount-only effect).
let mountEditor = true

vi.mock('../MonacoEditor', () => ({
  MonacoEditor: vi.fn(({ onMount }: { onMount?: (editor: unknown) => void }) => {
    if (mountEditor && onMount) onMount(mockEditor)
    return <></>
  }),
}))

vi.mock('../../monacoThemes', () => ({
  ensureMonacoTheme: (theme: string) => `wa-${theme}`,
  editorFontOptions: () => ({ fontSize: 14, fontFamily: 'monospace' }),
}))

describe('SqlTab sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mountEditor = true
    mockEditor.getValue.mockReturnValue('SELECT 0')
  })

  it('appends query SQL with comment header when sidebar item clicked', async () => {
    render(<SqlTab queries={queries} theme="dark" />)
    await userEvent.click(screen.getByText('Top CPU Consumers'))
    expect(mockEditor.setValue).toHaveBeenCalledWith(
      'SELECT 0\n\n-- Top CPU Consumers\nSELECT cpu FROM stmt_stats LIMIT 25'
    )
  })

  it('does not call setValue if editor is not mounted', async () => {
    mountEditor = false
    render(<SqlTab queries={queries} theme="dark" />)
    await userEvent.click(screen.getByText('Top CPU Consumers'))
    expect(mockEditor.setValue).not.toHaveBeenCalled()
  })

  it('passes the registered Monaco theme for the active UI theme', () => {
    render(<SqlTab queries={queries} theme="light-hc" />)
    const props = vi.mocked(MonacoEditor).mock.calls.at(-1)?.[0]
    expect(props).toEqual(expect.objectContaining({ theme: 'wa-light-hc' }))
  })
})
