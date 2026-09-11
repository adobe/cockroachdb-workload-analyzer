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
import { DatabasePicker } from './DatabasePicker'

describe('DatabasePicker', () => {
  it('renders "All databases" as default option', () => {
    render(<DatabasePicker databases={['db_a', 'db_b']} selected="" onSelect={() => {}} />)
    expect(screen.getByRole('option', { name: 'All databases' })).toBeInTheDocument()
  })

  it('renders all provided databases as options', () => {
    render(<DatabasePicker databases={['prod', 'staging']} selected="" onSelect={() => {}} />)
    expect(screen.getByRole('option', { name: 'prod' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'staging' })).toBeInTheDocument()
  })

  it('calls onSelect with the selected value', async () => {
    const onSelect = vi.fn()
    render(<DatabasePicker databases={['db_a', 'db_b']} selected="" onSelect={onSelect} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'db_a')
    expect(onSelect).toHaveBeenCalledWith('db_a')
  })

  it('labels the select for assistive tech', () => {
    render(<DatabasePicker databases={['db_a', 'db_b']} selected="" onSelect={() => {}} />)
    expect(screen.getByRole('combobox', { name: /database/i })).toBeInTheDocument()
  })

  it('reflects the selected prop as the current value', () => {
    render(<DatabasePicker databases={['db_a', 'db_b']} selected="db_b" onSelect={() => {}} />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('db_b')
  })
})
