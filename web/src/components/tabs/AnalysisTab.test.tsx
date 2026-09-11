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
import { AnalysisTab } from './AnalysisTab'
import type { QueryDef } from '../../api'

// The query catalog is now owned by App and passed in via props, so AnalysisTab
// no longer fetches it (and no longer surfaces a load error — App does). These
// tests cover the presentational contract: render what you're given.
const queries: QueryDef[] = [
  {
    id: 'stmt-top-cpu',
    category: 'Statements',
    name: 'Top CPU Consumers',
    description: 'Top CPU',
    sql: 'SELECT cpu FROM stmt_stats LIMIT 25',
    db_filter_expr: "json_extract_string(metadata, '$.db')",
  },
]

describe('AnalysisTab', () => {
  it('renders the query catalog passed in via props', () => {
    render(<AnalysisTab queries={queries} selectedDb="" />)
    expect(screen.getByText('Top CPU Consumers')).toBeInTheDocument()
  })

  it('renders no query buttons when the catalog is empty', () => {
    render(<AnalysisTab queries={[]} selectedDb="" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
