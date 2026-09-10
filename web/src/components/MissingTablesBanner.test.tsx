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
import { describe, expect, it } from 'vitest'
import { MissingTablesBanner } from './MissingTablesBanner'
import type { TableEntry } from '../api'

const t = (name: string, loaded: boolean, error?: string): TableEntry => ({ name, loaded, error })

describe('MissingTablesBanner', () => {
  it('renders nothing when every table loaded', () => {
    const { container } = render(
      <MissingTablesBanner tables={[t('stmt_stats', true), t('txn_stats', true)]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for an empty table list', () => {
    const { container } = render(<MissingTablesBanner tables={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('lists the tables that did not load, with their reason', () => {
    render(
      <MissingTablesBanner
        tables={[
          t('stmt_stats', true),
          t('node_cpu_mem', false, 'not in export'),
          t('gossip_nodes', false, 'not in export'),
        ]}
      />,
    )
    expect(screen.getByText('node_cpu_mem')).toBeInTheDocument()
    expect(screen.getByText('gossip_nodes')).toBeInTheDocument()
    // plural count
    expect(screen.getByText(/2 tables/)).toBeInTheDocument()
  })

  it('uses singular wording for one missing table', () => {
    render(<MissingTablesBanner tables={[t('gossip_nodes', false, 'not in export')]} />)
    expect(screen.getByText(/1 table\b/)).toBeInTheDocument()
  })

  it('can be dismissed', () => {
    render(<MissingTablesBanner tables={[t('gossip_nodes', false, 'not in export')]} />)
    expect(screen.getByText('gossip_nodes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('gossip_nodes')).not.toBeInTheDocument()
  })
})
