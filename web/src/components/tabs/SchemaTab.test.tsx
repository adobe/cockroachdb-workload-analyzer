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
import { SchemaTab } from './SchemaTab'

// The database picker and the schema fetch live in App (useSchema), so this
// component only renders what it is given.
describe('SchemaTab', () => {
  it('renders the DDL it is given', () => {
    render(<SchemaTab ddl="CREATE TABLE prod ..." error={null} onDismissError={() => {}} />)
    expect(screen.getByText('CREATE TABLE prod ...')).toBeInTheDocument()
  })

  it('shows a loading placeholder until the DDL arrives', () => {
    render(<SchemaTab ddl={null} error={null} onDismissError={() => {}} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders no picker of its own', () => {
    render(<SchemaTab ddl="x" error={null} onDismissError={() => {}} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('surfaces the error banner and forwards dismissal', async () => {
    const onDismissError = vi.fn()
    render(<SchemaTab ddl={null} error="Couldn't load the schema." onDismissError={onDismissError} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/schema/i)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismissError).toHaveBeenCalledTimes(1)
  })
})
