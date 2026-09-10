// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Editor from '@monaco-editor/react'
import { SqlTab } from './SqlTab'

const mockEditor = {
  getValue: vi.fn().mockReturnValue('SELECT 0'),
  setValue: vi.fn(),
  addCommand: vi.fn(),
}

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(({ onMount }: { onMount?: (editor: unknown) => void }) => {
    if (onMount) onMount(mockEditor)
    return null
  }),
}))

describe('SqlTab sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEditor.getValue.mockReturnValue('SELECT 0')
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve([
          {
            id: 'stmt-top-cpu',
            category: 'Statements',
            name: 'Top CPU Consumers',
            description: 'Top CPU',
            sql: 'SELECT cpu FROM stmt_stats LIMIT 25',
            db_filter_expr: "json_extract_string(metadata, '$.db')",
          },
        ]),
    })
  })

  it('appends query SQL with comment header when sidebar item clicked', async () => {
    render(<SqlTab />)
    await waitFor(() => screen.getByText('Top CPU Consumers'))
    await userEvent.click(screen.getByText('Top CPU Consumers'))
    expect(mockEditor.setValue).toHaveBeenCalledWith(
      'SELECT 0\n\n-- Top CPU Consumers\nSELECT cpu FROM stmt_stats LIMIT 25'
    )
  })

  it('does not call setValue if editor is not mounted', async () => {
    vi.mocked(Editor).mockImplementationOnce(() => null)
    render(<SqlTab />)
    await waitFor(() => screen.getByText('Top CPU Consumers'))
    await userEvent.click(screen.getByText('Top CPU Consumers'))
    expect(mockEditor.setValue).not.toHaveBeenCalled()
  })
})
