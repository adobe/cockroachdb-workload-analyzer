// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutsDialog } from './ShortcutsDialog'
import { SHORTCUT_GROUPS } from '../shortcuts'

describe('ShortcutsDialog', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsDialog open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a labelled modal dialog listing every shortcut group', () => {
    render(<ShortcutsDialog open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    for (const group of SHORTCUT_GROUPS) {
      expect(screen.getByRole('heading', { name: group.title })).toBeInTheDocument()
      for (const s of group.shortcuts) expect(screen.getByText(s.description)).toBeInTheDocument()
    }
  })

  it('renders each key in a kbd element', () => {
    render(<ShortcutsDialog open onClose={() => {}} />)
    const kbds = screen.getByRole('dialog').querySelectorAll('kbd')
    const keys = [...kbds].map(k => k.textContent)
    expect(keys).toEqual(expect.arrayContaining(['?', 'Esc', '1', 'j', 'k', '↵']))
  })

  it('moves focus to the close button on open and restores it on close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>trigger</button>
          <ShortcutsDialog open={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'trigger' })
    await userEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape, on the close button and on the backdrop', async () => {
    const onClose = vi.fn()
    render(<ShortcutsDialog open onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByTestId('shortcuts-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('keeps Tab focus inside the dialog', async () => {
    render(
      <>
        <button>outside</button>
        <ShortcutsDialog open onClose={() => {}} />
      </>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    await userEvent.tab({ shift: true })
    expect(close).toHaveFocus()
  })

  // Clicking non-focusable text inside the dialog blurs the close button, so
  // focus falls to body. Tab must still land inside the dialog rather than on
  // the page behind the backdrop.
  it('pulls Tab back into the dialog when focus has left it', async () => {
    render(
      <>
        <button>outside</button>
        <ShortcutsDialog open onClose={() => {}} />
      </>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    close.blur()
    expect(document.body).toHaveFocus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    close.blur()
    await userEvent.tab({ shift: true })
    expect(close).toHaveFocus()
  })
})
