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
import userEvent from '@testing-library/user-event'
import { ApiError, fetchMeta, fetchQueries, fetchDatabases, fetchSchema } from './api'
import { installMatchMedia } from './test/matchMedia'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    fetchMeta: vi.fn(),
    fetchQueries: vi.fn(),
    fetchDatabases: vi.fn(),
    fetchSchema: vi.fn(),
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
    installMatchMedia()
    vi.clearAllMocks()
    vi.mocked(fetchMeta).mockResolvedValue({
      version: '1', timestamp: '', cluster_version: '', cluster_id: '',
      organization: '', virtual_cluster: false,
    })
    vi.mocked(fetchQueries).mockResolvedValue([])
    vi.mocked(fetchDatabases).mockResolvedValue([])
    vi.mocked(fetchSchema).mockResolvedValue({ databases: { staging: 'CREATE TABLE staging ...', prod: 'CREATE TABLE prod ...' } })
  })

  it('shows an error banner when the query catalog fails to load', async () => {
    vi.mocked(fetchQueries).mockRejectedValue(new ApiError(503, 'Service Unavailable', '/api/queries'))
    render(<App />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/quer/i)
    })
  })

  it('shows an error banner when the database list fails to load', async () => {
    vi.mocked(fetchDatabases).mockRejectedValue(new ApiError(503, 'Service Unavailable', '/api/databases'))
    render(<App />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/database/i)
    })
  })

  it('merges both failures into a single banner when the query and database loads both fail', async () => {
    vi.mocked(fetchQueries).mockRejectedValue(new ApiError(503, 'Service Unavailable', '/api/queries'))
    vi.mocked(fetchDatabases).mockRejectedValue(new ApiError(503, 'Service Unavailable', '/api/databases'))
    render(<App />)
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent(/quer/i)
      expect(alerts[0]).toHaveTextContent(/database/i)
    })
  })

  it('shows no error banner when every fetch succeeds', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('analysis')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('App database picker per tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installMatchMedia()
    vi.mocked(fetchMeta).mockResolvedValue({
      version: '1', timestamp: '', cluster_version: '', cluster_id: '',
      organization: '', virtual_cluster: false,
    })
    vi.mocked(fetchQueries).mockResolvedValue([])
    vi.mocked(fetchDatabases).mockResolvedValue(['movr'])
    vi.mocked(fetchSchema).mockResolvedValue({ databases: { staging: 'CREATE TABLE staging ...', prod: 'CREATE TABLE prod ...' } })
  })

  it('shows the schema database picker in the tab bar without an "All databases" option', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Schema' }))
    const picker = await screen.findByRole('combobox', { name: 'Select database schema' })
    expect(screen.getByRole('navigation')).toContainElement(picker)
    expect(screen.getAllByRole('option').filter(o => o.closest('select') === picker).map(o => o.textContent)).toEqual(['prod', 'staging'])
    expect(screen.queryByRole('option', { name: 'All databases' })).not.toBeInTheDocument()
  })

  it('does not request the schema until the Schema tab is opened', async () => {
    render(<App />)
    await screen.findByRole('combobox', { name: 'Filter by database' })
    expect(fetchSchema).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Schema' }))
    await screen.findByRole('combobox', { name: 'Select database schema' })
    expect(fetchSchema).toHaveBeenCalledTimes(1)
  })

  it('switches back to the filter picker with "All databases" on the Analysis tab', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Schema' }))
    await screen.findByRole('combobox', { name: 'Select database schema' })
    await userEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    const picker = await screen.findByRole('combobox', { name: 'Filter by database' })
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All databases' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Select database schema' })).not.toBeInTheDocument()
  })
})
