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
import { ThemeSelect } from './ThemeSelect'

describe('ThemeSelect', () => {
  it('lists the five choices and marks the current preference', () => {
    render(<ThemeSelect preference="dark-hc" theme="dark-hc" onChange={() => {}} />)
    const select = screen.getByRole('combobox', { name: 'Color theme' }) as HTMLSelectElement
    expect(select.value).toBe('dark-hc')
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'Follow system (Dark high contrast)', 'Dark', 'Light', 'Dark high contrast', 'Light high contrast',
    ])
  })

  it('shows the effective theme next to Follow system', () => {
    render(<ThemeSelect preference="system" theme="light" onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Follow system (Light)' })).toBeInTheDocument()
  })

  it('reports a new preference on change', async () => {
    const onChange = vi.fn()
    render(<ThemeSelect preference="system" theme="dark" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'light-hc')
    expect(onChange).toHaveBeenCalledWith('light-hc')
  })
})
