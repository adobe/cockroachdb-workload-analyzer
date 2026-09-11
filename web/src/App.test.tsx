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
import { describe, expect, it, vi, beforeEach } from 'vitest'
import App from './App'
import { ApiError, fetchMeta, fetchQueries, fetchDatabases } from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    fetchMeta: vi.fn(),
    fetchQueries: vi.fn(),
    fetchDatabases: vi.fn(),
  }
})

vi.mock('./hooks/useStatus', () => ({
  useStatus: () => ({ state: 'ready', progress: 100, tables: [] }),
}))

// Isolate App: stub the tabs so their own fetches don't interfere.
vi.mock('./components/tabs/AnalysisTab', () => ({ AnalysisTab: () => <div>analysis</div> }))
vi.mock('./components/tabs/SqlTab', () => ({ SqlTab: () => <div>sql</div> }))
vi.mock('./components/tabs/SchemaTab', () => ({ SchemaTab: () => <div>schema</div> }))

describe('App fetch error surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMeta).mockResolvedValue({
      version: '1', timestamp: '', cluster_version: '', cluster_id: '',
      organization: '', virtual_cluster: false,
    })
    vi.mocked(fetchQueries).mockResolvedValue([])
    vi.mocked(fetchDatabases).mockResolvedValue([])
  })

  it('shows an error banner when the database list fails to load', async () => {
    vi.mocked(fetchDatabases).mockRejectedValue(new ApiError(503, 'Service Unavailable', '/api/databases'))
    render(<App />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/database/i)
    })
  })

  it('stays silent when only the query list fails — AnalysisTab owns that error', async () => {
    // App fetches the query list only as a fast fallback for AnalysisTab, which
    // surfaces its own banner. App must not add a second banner for the same
    // failure, so no alert should appear here.
    vi.mocked(fetchQueries).mockRejectedValue(new ApiError(503, 'Service Unavailable', '/api/queries'))
    render(<App />)
    await waitFor(() => expect(screen.getByText('analysis')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows no error banner when every fetch succeeds', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('analysis')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
