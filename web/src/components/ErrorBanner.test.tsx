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
import { describe, expect, it, vi } from 'vitest'
import { ErrorBanner } from './ErrorBanner'

describe('ErrorBanner', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<ErrorBanner message={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('announces the message to assistive tech via role=alert', () => {
    render(<ErrorBanner message="Couldn't load the query list (503)." />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the query list (503).")
  })

  it('invokes onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn()
    render(<ErrorBanner message="boom" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('omits the close button when no onDismiss is given', () => {
    render(<ErrorBanner message="boom" />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })
})
