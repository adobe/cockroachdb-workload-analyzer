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
import { ResultsTable } from './ResultsTable'

describe('ResultsTable', () => {
  it('shows empty message when no result', () => {
    render(<ResultsTable result={null} loading={false} />)
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })

  it('shows loading indicator', () => {
    render(<ResultsTable result={null} loading={true} />)
    expect(screen.getByText(/running/i)).toBeInTheDocument()
  })

  it('renders columns and rows', () => {
    const result = {
      columns: ['id', 'name'],
      rows: [[1, 'alice'], [2, 'bob']],
      duration_ms: 5,
    }
    render(<ResultsTable result={result} loading={false} />)
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('shows error message from result', () => {
    const result = {
      columns: [],
      rows: [],
      duration_ms: 1,
      error: 'Table does not exist',
    }
    render(<ResultsTable result={result} loading={false} />)
    expect(screen.getByText(/table does not exist/i)).toBeInTheDocument()
  })

  it('shows a friendly empty state for a zero-row result', () => {
    const result = { columns: ['a'], rows: [], duration_ms: 3 }
    render(<ResultsTable result={result} loading={false} />)
    expect(screen.getByText(/nothing to report/i)).toBeInTheDocument()
  })

  it('shows CSV and JSON export buttons for a non-empty result', () => {
    const result = { columns: ['a'], rows: [[1]], duration_ms: 1 }
    render(<ResultsTable result={result} loading={false} />)
    expect(screen.getByRole('button', { name: /csv/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /json/i })).toBeInTheDocument()
  })

  it('triggers a download when an export button is clicked', async () => {
    const createURL = vi.fn(() => 'blob:x')
    globalThis.URL.createObjectURL = createURL
    globalThis.URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const result = { columns: ['a'], rows: [[1]], duration_ms: 1 }
    render(<ResultsTable result={result} loading={false} />)
    await userEvent.click(screen.getByRole('button', { name: /csv/i }))

    expect(createURL).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('formats unit columns for display while keeping the raw value in the tooltip', () => {
    const result = {
      columns: ['weighted_mean_run_lat_sec', 'total_executions'],
      rows: [[0.5, 12345]],
      duration_ms: 1,
    }
    render(<ResultsTable result={result} loading={false} />)
    // seconds → ms for display
    const cell = screen.getByText('500 ms')
    expect(cell).toBeInTheDocument()
    // raw value preserved in the tooltip
    expect(cell.getAttribute('title')).toBe('0.5')
    // plain numeric columns are untouched
    expect(screen.getByText('12345')).toBeInTheDocument()
  })

  it('renders fingerprint_id cell as clickable link when onFingerprintClick provided', () => {
    const onFingerprintClick = vi.fn()
    const result = {
      columns: ['fingerprint_id', 'name'],
      rows: [['\\xcaaa890e4d5329cd', 'alice']],
      duration_ms: 1,
    }
    render(<ResultsTable result={result} loading={false} onFingerprintClick={onFingerprintClick} />)
    const link = screen.getByText('\\xcaaa890e4d5329cd')
    expect(link.className).toContain('fingerprint-link')
  })

  it('renders the fingerprint cell as a focusable button for keyboard access', () => {
    const onFingerprintClick = vi.fn()
    const result = {
      columns: ['fingerprint_id', 'name'],
      rows: [['\\xcaaa890e4d5329cd', 'alice']],
      duration_ms: 1,
    }
    render(<ResultsTable result={result} loading={false} onFingerprintClick={onFingerprintClick} />)
    expect(screen.getByRole('button', { name: '\\xcaaa890e4d5329cd' })).toBeInTheDocument()
  })

  it('calls onFingerprintClick with cell value when fingerprint cell clicked', async () => {
    const onFingerprintClick = vi.fn()
    const result = {
      columns: ['fingerprint_id', 'name'],
      rows: [['\\xcaaa890e4d5329cd', 'alice']],
      duration_ms: 1,
    }
    render(<ResultsTable result={result} loading={false} onFingerprintClick={onFingerprintClick} />)
    await userEvent.click(screen.getByText('\\xcaaa890e4d5329cd'))
    expect(onFingerprintClick).toHaveBeenCalledWith('\\xcaaa890e4d5329cd')
  })

  it('renders fingerprint_id as plain text when onFingerprintClick not provided', () => {
    const result = {
      columns: ['fingerprint_id', 'name'],
      rows: [['\\xcaaa890e4d5329cd', 'alice']],
      duration_ms: 1,
    }
    render(<ResultsTable result={result} loading={false} />)
    const cell = screen.getByText('\\xcaaa890e4d5329cd')
    expect(cell.tagName).toBe('TD')
  })

  describe('column sorting', () => {
    // Returns the visible first-column cell text for every body row, in DOM order.
    function bodyFirstColumn(): string[] {
      const table = screen.getByRole('table')
      const bodyRows = table.querySelectorAll('tbody tr')
      return Array.from(bodyRows).map(
        r => r.querySelector('td')?.textContent ?? '',
      )
    }

    it('shows a neutral sort glyph on every header at rest, and a direction arrow on the active column', async () => {
      const result = {
        columns: ['total_executions', 'name'],
        rows: [[100, 'a'], [9, 'b']],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)

      // At rest every sortable header advertises itself with a neutral glyph.
      const headers = screen.getAllByRole('columnheader')
      for (const th of headers) {
        expect(th.querySelector('.col-sort-arrow')?.textContent).toBe('⇅')
      }

      // After sorting, the active column shows the direction; others stay neutral.
      await userEvent.click(screen.getByRole('button', { name: /total_executions/i }))
      const [activeTh, otherTh] = screen.getAllByRole('columnheader')
      expect(activeTh.querySelector('.col-sort-arrow')?.textContent).toBe('▲')
      expect(otherTh.querySelector('.col-sort-arrow')?.textContent).toBe('⇅')
    })

    it('sorts numerically ascending on first header click', async () => {
      const result = {
        columns: ['total_executions', 'name'],
        rows: [[100, 'a'], [9, 'b'], [42, 'c']],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)
      await userEvent.click(screen.getByRole('button', { name: /total_executions/i }))
      expect(bodyFirstColumn()).toEqual(['9', '42', '100'])
    })

    it('cycles asc → desc → none on repeated header clicks', async () => {
      const result = {
        columns: ['total_executions', 'name'],
        rows: [[100, 'a'], [9, 'b'], [42, 'c']],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)
      const header = screen.getByRole('button', { name: /total_executions/i })

      await userEvent.click(header) // asc
      expect(bodyFirstColumn()).toEqual(['9', '42', '100'])
      await userEvent.click(header) // desc
      expect(bodyFirstColumn()).toEqual(['100', '42', '9'])
      await userEvent.click(header) // none → original server order
      expect(bodyFirstColumn()).toEqual(['100', '9', '42'])
    })

    it('sorts numeric string values (bigint/decimal) as numbers, not lexically', async () => {
      const result = {
        columns: ['rows_read', 'name'],
        rows: [['100', 'a'], ['9', 'b'], ['42', 'c']],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)
      await userEvent.click(screen.getByRole('button', { name: /rows_read/i }))
      expect(bodyFirstColumn()).toEqual(['9', '42', '100'])
    })

    it('sorts non-numeric columns lexically', async () => {
      const result = {
        columns: ['name', 'total_executions'],
        rows: [['charlie', 1], ['alice', 2], ['bob', 3]],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)
      await userEvent.click(screen.getByRole('button', { name: /name/i }))
      expect(bodyFirstColumn()).toEqual(['alice', 'bob', 'charlie'])
    })

    it('sorts NULLs last in both directions', async () => {
      const result = {
        columns: ['total_executions', 'name'],
        rows: [[100, 'a'], [null, 'b'], [42, 'c']],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)
      const header = screen.getByRole('button', { name: /total_executions/i })

      await userEvent.click(header) // asc
      expect(bodyFirstColumn()).toEqual(['42', '100', 'NULL'])
      await userEvent.click(header) // desc
      expect(bodyFirstColumn()).toEqual(['100', '42', 'NULL'])
    })

    it('exports the sorted view, not the original order', async () => {
      const createURL = vi.fn((_blob: Blob) => 'blob:x')
      globalThis.URL.createObjectURL = createURL
      globalThis.URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      const result = {
        columns: ['total_executions'],
        rows: [[100], [9], [42]],
        duration_ms: 1,
      }
      render(<ResultsTable result={result} loading={false} />)
      await userEvent.click(screen.getByRole('button', { name: /total_executions/i }))
      await userEvent.click(screen.getByRole('button', { name: /csv/i }))

      const blob = createURL.mock.calls[0][0]
      const text = await blob.text()
      // sorted ascending: header line + 9,42,100
      expect(text).toBe('total_executions\n9\n42\n100')
    })
  })
})
