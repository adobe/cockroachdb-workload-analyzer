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
import { describe, expect, it } from 'vitest'
import { MetaBar } from './MetaBar'
import type { MetaResult } from '../api'

const baseMeta: MetaResult = {
  version: '1.0.0',
  timestamp: '2026-05-29T14:18:48Z',
  cluster_version: 'CockroachDB CCL v26.2.1',
  cluster_id: 'abc',
  organization: 'Cockroach Cloud',
  virtual_cluster: false,
}

describe('MetaBar', () => {
  it('shows the export window when the export carries one', () => {
    render(
      <MetaBar
        meta={{ ...baseMeta, time_range: { start: '2026-05-28T19:00:00Z', end: '2026-05-29T18:48:00Z' } }}
        filename="workload export"
      />,
    )
    expect(screen.getByText('2026-05-28 19:00 – 2026-05-29 18:48 UTC (23h 48m)')).toBeInTheDocument()
  })

  it('keeps the raw timestamps in the tooltip', () => {
    render(
      <MetaBar
        meta={{ ...baseMeta, time_range: { start: '2026-05-28T19:00:00Z', end: '2026-05-29T18:48:00Z' } }}
        filename="workload export"
      />,
    )
    expect(screen.getByTitle('Export window: 2026-05-28T19:00:00Z to 2026-05-29T18:48:00Z')).toBeInTheDocument()
  })

  it('omits the window when the export has no time range', () => {
    render(<MetaBar meta={baseMeta} filename="workload export" />)
    expect(screen.queryByText(/UTC/)).not.toBeInTheDocument()
    expect(screen.getByText('v26.2.1')).toBeInTheDocument()
  })

  it('renders only the filename before meta has loaded', () => {
    render(<MetaBar meta={null} filename="workload export" />)
    expect(screen.getByText('workload export')).toBeInTheDocument()
    expect(screen.queryByText(/UTC/)).not.toBeInTheDocument()
  })
})
