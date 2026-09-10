// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { describe, expect, it } from 'vitest'
import { drawerToText } from './drawerText'
import type { StmtDetail } from './hooks/useFingerprintDetail'

const stmt = (over: Partial<StmtDetail> = {}): StmtDetail => ({
  fingerprintId: '\\xstmt',
  queryText: 'SELECT 1',
  executions: 100,
  meanRunLatSec: 0.5,
  contentionSec: 0.01,
  fullScan: false,
  ...over,
})

describe('drawerToText', () => {
  it('serializes a single statement with its fingerprint, query, and stats', () => {
    const text = drawerToText('\\xfp', 'statement', [stmt()])
    expect(text).toContain('\\xfp')
    expect(text).toContain('SELECT 1')
    expect(text).toContain('executions: 100')
    expect(text).toContain('mean run latency: 0.5s')
    expect(text).toContain('full scan: no')
    // no per-statement numbering for a lone statement
    expect(text).not.toContain('Statement 1 of')
  })

  it('serializes a transaction with a heading and numbered statements', () => {
    const text = drawerToText('\\xtxn', 'transaction', [
      stmt({ queryText: 'SELECT a' }),
      stmt({ queryText: 'UPDATE b', contentionSec: null }),
    ])
    expect(text).toContain('Statements in this transaction (2):')
    expect(text).toContain('-- Statement 1 of 2')
    expect(text).toContain('SELECT a')
    expect(text).toContain('-- Statement 2 of 2')
    expect(text).toContain('UPDATE b')
    expect(text).toContain('contention: —')
  })

  it('handles an empty drawer', () => {
    expect(drawerToText('\\xfp', 'none', [])).toContain('No query text found')
  })

  it('renders a missing query text as a placeholder', () => {
    const text = drawerToText('\\xfp', 'statement', [stmt({ queryText: '' })])
    expect(text).toContain('(no query text)')
  })
})
