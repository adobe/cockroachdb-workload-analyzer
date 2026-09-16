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
    await userEvent.click(screen.getByRole('tab', { name: 'Schema' }))
    const picker = await screen.findByRole('combobox', { name: 'Select database schema' })
    expect(screen.getByRole('navigation')).toContainElement(picker)
    expect(screen.getAllByRole('option').filter(o => o.closest('select') === picker).map(o => o.textContent)).toEqual(['prod', 'staging'])
    expect(screen.queryByRole('option', { name: 'All databases' })).not.toBeInTheDocument()
  })

  it('does not request the schema until the Schema tab is opened', async () => {
    render(<App />)
    await screen.findByRole('combobox', { name: 'Filter by database' })
    expect(fetchSchema).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('tab', { name: 'Schema' }))
    await screen.findByRole('combobox', { name: 'Select database schema' })
    expect(fetchSchema).toHaveBeenCalledTimes(1)
  })

  it('switches back to the filter picker with "All databases" on the Analysis tab', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'Schema' }))
    await screen.findByRole('combobox', { name: 'Select database schema' })
    await userEvent.click(screen.getByRole('tab', { name: 'Analysis' }))
    const picker = await screen.findByRole('combobox', { name: 'Filter by database' })
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All databases' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Select database schema' })).not.toBeInTheDocument()
  })
})

describe('App keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installMatchMedia()
    vi.mocked(fetchMeta).mockResolvedValue({
      version: '1', timestamp: '', cluster_version: '', cluster_id: '',
      organization: '', virtual_cluster: false,
    })
    vi.mocked(fetchQueries).mockResolvedValue([])
    vi.mocked(fetchDatabases).mockResolvedValue(['movr'])
    vi.mocked(fetchSchema).mockResolvedValue({ databases: { movr: 'CREATE TABLE ...' } })
  })

  it('exposes the tabs as a tablist controlling a labelled tabpanel', async () => {
    render(<App />)
    await screen.findByText('analysis')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => t.textContent)).toEqual(['Analysis', 'SQL', 'Schema'])
    expect(screen.getByRole('tablist')).toContainElement(tabs[0])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    const panel = screen.getByRole('tabpanel', { name: 'Analysis' })
    expect(panel).toHaveTextContent('analysis')
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id)
  })

  it('moves between tabs with arrow keys, wrapping, and with Home/End', async () => {
    render(<App />)
    await screen.findByText('analysis')
    screen.getByRole('tab', { name: 'Analysis' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'SQL' })).toHaveFocus()
    expect(screen.getByText('sql')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Analysis' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Schema' })).toHaveFocus()
    expect(screen.getByText('schema')).toBeInTheDocument()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Analysis' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Schema' })).toHaveFocus()
  })

  it('switches tabs with the digit keys from anywhere on the page', async () => {
    render(<App />)
    await screen.findByText('analysis')
    await userEvent.keyboard('2')
    expect(screen.getByText('sql')).toBeInTheDocument()
    await userEvent.keyboard('3')
    expect(screen.getByText('schema')).toBeInTheDocument()
    await userEvent.keyboard('1')
    expect(screen.getByText('analysis')).toBeInTheDocument()
  })

  it('moves focus to the tab selected by a digit key so the arrows work next', async () => {
    render(<App />)
    await screen.findByText('analysis')
    // Fresh page: nothing is focused, the digit is handled page-wide.
    expect(document.body).toHaveFocus()
    await userEvent.keyboard('2')
    expect(screen.getByRole('tab', { name: 'SQL' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText('schema')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Schema' })).toHaveFocus()
  })

  it('ignores digit keys while a select has focus', async () => {
    render(<App />)
    const picker = await screen.findByRole('combobox', { name: 'Filter by database' })
    picker.focus()
    await userEvent.keyboard('2')
    expect(screen.getByText('analysis')).toBeInTheDocument()
  })

  it('opens the shortcuts dialog with ? and closes it with Escape', async () => {
    render(<App />)
    await screen.findByText('analysis')
    await userEvent.keyboard('?')
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    // Digits must not switch tabs behind the modal.
    await userEvent.keyboard('2')
    expect(screen.getByText('analysis')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the shortcuts dialog from the meta bar button', async () => {
    render(<App />)
    await screen.findByText('analysis')
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })
})
