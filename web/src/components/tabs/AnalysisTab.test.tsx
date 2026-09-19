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
import { describe, expect, it, vi } from 'vitest'
import { AnalysisTab } from './AnalysisTab'
import { runCatalogQuery } from '../../api'
import type { QueryDef } from '../../api'

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return { ...actual, runCatalogQuery: vi.fn() }
})

// The query catalog is now owned by App and passed in via props, so AnalysisTab
// no longer fetches it (and no longer surfaces a load error — App does). These
// tests cover the presentational contract: render what you're given.
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

describe('AnalysisTab', () => {
  it('renders the query catalog passed in via props', () => {
    render(<AnalysisTab queries={queries} selectedDb="" />)
    expect(screen.getByText('Top CPU Consumers')).toBeInTheDocument()
  })

  it('renders no query buttons when the catalog is empty', () => {
    render(<AnalysisTab queries={[]} selectedDb="" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the next query as the keyboard cursor moves through the list', async () => {
    vi.mocked(runCatalogQuery).mockResolvedValue({ columns: [], rows: [], duration_ms: 0 })
    const two = [
      ...queries,
      { ...queries[0], id: 'stmt-top-latency', name: 'Top Latency' },
    ]
    render(<AnalysisTab queries={two} selectedDb="" />)
    screen.getByRole('button', { name: 'Top CPU Consumers' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('heading', { name: 'Top Latency' })).toBeInTheDocument()
    expect(runCatalogQuery).toHaveBeenCalledWith('stmt-top-latency', '')
  })
})

describe('AnalysisTab database picker', () => {
  const ok = { columns: [], rows: [], duration_ms: 0 }

  it('does not re-run a non-filterable query when the picker changes', async () => {
    vi.mocked(runCatalogQuery).mockReset().mockResolvedValue(ok)
    const unfiltered = [{ ...queries[0], db_filter_expr: '' }]
    const { rerender } = render(<AnalysisTab queries={unfiltered} selectedDb="" />)
    await userEvent.click(screen.getByRole('button', { name: 'Top CPU Consumers' }))
    expect(runCatalogQuery).toHaveBeenCalledTimes(1)
    expect(runCatalogQuery).toHaveBeenCalledWith('stmt-top-cpu', '')

    rerender(<AnalysisTab queries={unfiltered} selectedDb="movr" />)
    expect(runCatalogQuery).toHaveBeenCalledTimes(1)
  })

  it('re-runs a filterable query against the newly selected database', async () => {
    vi.mocked(runCatalogQuery).mockReset().mockResolvedValue(ok)
    const { rerender } = render(<AnalysisTab queries={queries} selectedDb="" />)
    await userEvent.click(screen.getByRole('button', { name: 'Top CPU Consumers' }))
    expect(runCatalogQuery).toHaveBeenCalledTimes(1)

    rerender(<AnalysisTab queries={queries} selectedDb="movr" />)
    expect(runCatalogQuery).toHaveBeenCalledTimes(2)
    expect(runCatalogQuery).toHaveBeenLastCalledWith('stmt-top-cpu', 'movr')
  })
})
