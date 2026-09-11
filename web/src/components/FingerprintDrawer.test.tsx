// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FingerprintDrawer } from './FingerprintDrawer'
import type { StmtDetail, DetailKind } from '../hooks/useFingerprintDetail'

let mockState: {
  statements: StmtDetail[]
  kind: DetailKind
  loading: boolean
  error: string | null
}

vi.mock('../hooks/useFingerprintDetail', () => ({
  useFingerprintDetail: () => ({ ...mockState, lookup: vi.fn() }),
}))

const stmt = (over: Partial<StmtDetail> = {}): StmtDetail => ({
  fingerprintId: '\\xstmt',
  queryText: 'SELECT 1',
  executions: 100,
  meanRunLatSec: 0.5,
  contentionSec: 0.01,
  fullScan: false,
  ...over,
})

beforeEach(() => {
  mockState = { statements: [stmt()], kind: 'statement', loading: false, error: null }
})

describe('FingerprintDrawer', () => {
  it('renders nothing when fingerprint is null', () => {
    const { container } = render(<FingerprintDrawer fingerprint={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the fingerprint ID in the header', () => {
    render(<FingerprintDrawer fingerprint="\\xcaaa890e4d5329cd" onClose={() => {}} />)
    expect(screen.getByTitle('\\\\xcaaa890e4d5329cd')).toBeInTheDocument()
  })

  it('renders query text in a pre block', () => {
    render(<FingerprintDrawer fingerprint="\\xcaaa890e4d5329cd" onClose={() => {}} />)
    expect(screen.getByText('SELECT 1')).toBeInTheDocument()
  })

  it('renders per-statement stats (executions) for a statement fingerprint', () => {
    render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={() => {}} />)
    expect(screen.getByText('Executions')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('renders a transaction breakdown heading and each constituent statement', () => {
    mockState = {
      kind: 'transaction',
      loading: false,
      error: null,
      statements: [
        stmt({ fingerprintId: '\\xa', queryText: 'SELECT a' }),
        stmt({ fingerprintId: '\\xb', queryText: 'UPDATE b', contentionSec: null }),
      ],
    }
    render(<FingerprintDrawer fingerprint="\\xtxn" onClose={() => {}} />)
    expect(screen.getByText(/Statements in this transaction \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('SELECT a')).toBeInTheDocument()
    expect(screen.getByText('UPDATE b')).toBeInTheDocument()
  })

  it('shows an empty message when nothing resolves', () => {
    mockState = { statements: [], kind: 'none', loading: false, error: null }
    render(<FingerprintDrawer fingerprint="\\xnope" onClose={() => {}} />)
    expect(screen.getByText(/No query text found/)).toBeInTheDocument()
  })

  it('renders a resize handle', () => {
    const { container } = render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={() => {}} />)
    expect(container.querySelector('.drawer-resize')).toBeInTheDocument()
  })

  it('copies the drawer contents to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy drawer contents' }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('SELECT 1')
    expect(copied).toContain('executions: 100')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('exposes the drawer as a modal dialog for assistive tech', () => {
    render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label')
  })

  it('moves focus into the drawer when opened', () => {
    render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={onClose} />)
    fireEvent.click(container.querySelector('.drawer-backdrop')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape keydown', () => {
    const onClose = vi.fn()
    render(<FingerprintDrawer fingerprint="\\xcaaa" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
