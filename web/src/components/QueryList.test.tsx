// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryList } from './QueryList'
import type { QueryDef } from '../api'

const q = (id: string, category: string): QueryDef => ({
  id, category, name: id, description: '', sql: 'SELECT 1', db_filter_expr: '',
})
const queries = [q('a', 'Statements'), q('b', 'Statements'), q('c', 'Transactions')]

function item(id: string) {
  return screen.getByRole('button', { name: id })
}

describe('QueryList roving tabindex', () => {
  it('makes only the active query tabbable', () => {
    render(<QueryList queries={queries} activeId="b" onSelect={() => {}} />)
    expect(item('a')).toHaveAttribute('tabindex', '-1')
    expect(item('b')).toHaveAttribute('tabindex', '0')
    expect(item('c')).toHaveAttribute('tabindex', '-1')
  })

  it('makes the first query tabbable when nothing is active', () => {
    render(<QueryList queries={queries} activeId={null} onSelect={() => {}} />)
    expect(item('a')).toHaveAttribute('tabindex', '0')
    expect(item('b')).toHaveAttribute('tabindex', '-1')
  })

  it('marks the active query with aria-current', () => {
    render(<QueryList queries={queries} activeId="b" onSelect={() => {}} />)
    expect(item('b')).toHaveAttribute('aria-current', 'true')
    expect(item('a')).not.toHaveAttribute('aria-current')
  })
})

describe('QueryList click focus', () => {
  // Safari and Firefox on macOS do not focus a button on click; a plain click
  // event models them. The clicked item must still become the keyboard cursor.
  it('focuses the clicked query even when the browser does not focus buttons on click', async () => {
    render(<QueryList queries={queries} activeId={null} onSelect={() => {}} />)
    fireEvent.click(item('b'))
    expect(item('b')).toHaveFocus()
    expect(item('b')).toHaveAttribute('tabindex', '0')
    await userEvent.keyboard('{ArrowDown}')
    expect(item('c')).toHaveFocus()
  })
})

describe('QueryList arrow keys', () => {
  it('moves focus down and up across categories without wrapping', async () => {
    render(<QueryList queries={queries} activeId={null} onSelect={() => {}} />)
    item('a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(item('b')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(item('c')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(item('c')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(item('a')).toHaveFocus()
  })

  it('jumps to the first and last query with Home and End', async () => {
    render(<QueryList queries={queries} activeId={null} onSelect={() => {}} />)
    item('b').focus()
    await userEvent.keyboard('{End}')
    expect(item('c')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(item('a')).toHaveFocus()
  })

  it('keeps the focused query tabbable so Tab returns to it', async () => {
    render(<QueryList queries={queries} activeId={null} onSelect={() => {}} />)
    item('a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(item('b')).toHaveAttribute('tabindex', '0')
    expect(item('a')).toHaveAttribute('tabindex', '-1')
  })

  it('selects as focus moves when activation is automatic', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId="a" onSelect={onSelect} activation="automatic" />)
    item('a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('only moves focus when activation is manual, selecting on Enter', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId={null} onSelect={onSelect} />)
    item('a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})

describe('QueryList j/k global shortcuts', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('moves to the next and previous query from anywhere on the page', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId="a" onSelect={onSelect} activation="automatic" />)
    document.body.focus()
    await userEvent.keyboard('j')
    expect(item('b')).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith('b')
    await userEvent.keyboard('k')
    expect(item('a')).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })

  it('starts from the active query rather than the first', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId="b" onSelect={onSelect} activation="automatic" />)
    await userEvent.keyboard('j')
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('does not select in manual mode, only highlights', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId="a" onSelect={onSelect} />)
    await userEvent.keyboard('j')
    expect(item('b')).toHaveFocus()
    expect(onSelect).not.toHaveBeenCalled()
  })

  // With no cursor and no active query nothing is highlighted, so the first
  // j must land on the first query rather than skip past it, and k must not
  // be a silent no-op.
  it('lands on the first query when nothing is highlighted yet', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId={null} onSelect={onSelect} activation="automatic" />)
    await userEvent.keyboard('j')
    expect(item('a')).toHaveFocus()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })

  it('lands on the first query on k when nothing is highlighted yet', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId={null} onSelect={onSelect} activation="automatic" />)
    await userEvent.keyboard('k')
    expect(item('a')).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })

  it('ignores j/k while typing in an editable field', async () => {
    const onSelect = vi.fn()
    render(
      <>
        <input aria-label="field" />
        <QueryList queries={queries} activeId="a" onSelect={onSelect} activation="automatic" />
      </>,
    )
    await userEvent.click(screen.getByLabelText('field'))
    await userEvent.keyboard('j')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByLabelText('field')).toHaveValue('j')
  })

  it('ignores j/k while a modal is open', async () => {
    const onSelect = vi.fn()
    render(
      <>
        <div role="dialog" aria-modal="true" />
        <QueryList queries={queries} activeId="a" onSelect={onSelect} activation="automatic" />
      </>,
    )
    await userEvent.keyboard('j')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores j/k with modifier keys held', async () => {
    const onSelect = vi.fn()
    render(<QueryList queries={queries} activeId="a" onSelect={onSelect} activation="automatic" />)
    await userEvent.keyboard('{Meta>}j{/Meta}')
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
