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
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TabBar } from './TabBar'

type Id = 'a' | 'b' | 'c'
const TABS = [{ id: 'a' as Id, label: 'A' }, { id: 'b' as Id, label: 'B' }, { id: 'c' as Id, label: 'C' }]

function Harness() {
  const [active, setActive] = useState<Id>('a')
  return <TabBar tabs={TABS} active={active} onChange={setActive} />
}

describe('TabBar', () => {
  // Safari and Firefox on macOS do not focus a button when it is clicked, so
  // a plain click event (which, unlike userEvent.click, moves no focus) models
  // them. Without an explicit focus the arrow keys would have no tab to act on.
  it('focuses the clicked tab even when the browser does not focus buttons on click', async () => {
    render(<Harness />)
    const b = screen.getByRole('tab', { name: 'B' })
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-selected', 'true')
    expect(b).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'C' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true')
  })
})
