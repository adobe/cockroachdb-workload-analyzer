// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// Serialize the fingerprint drawer's contents to a pasteable plain-text block
// (query text + per-statement stats), for the drawer's Copy button.
import type { DetailKind, StmtDetail } from './hooks/useFingerprintDetail'

// Stat formatting shared with the drawer's on-screen cards, so the Copy text
// and the rendered values always agree.
export function fmtSec(v: number | null): string {
  return v == null ? '—' : `${v}s`
}

export function fmtNum(v: number | null): string {
  return v == null ? '—' : String(v)
}

function statLine(s: StmtDetail): string {
  return (
    `executions: ${fmtNum(s.executions)} | ` +
    `mean run latency: ${fmtSec(s.meanRunLatSec)} | ` +
    `contention: ${fmtSec(s.contentionSec)} | ` +
    `full scan: ${s.fullScan ? 'yes' : 'no'}`
  )
}

export function drawerToText(
  fingerprint: string,
  kind: DetailKind,
  statements: StmtDetail[],
): string {
  const lines: string[] = [fingerprint, '']
  if (statements.length === 0) {
    lines.push('No query text found for this fingerprint.')
    return lines.join('\n')
  }
  const isTxn = kind === 'transaction'
  if (isTxn) lines.push(`Statements in this transaction (${statements.length}):`, '')
  statements.forEach((s, i) => {
    if (isTxn) lines.push(`-- Statement ${i + 1} of ${statements.length}`)
    lines.push(s.queryText || '(no query text)')
    lines.push(statLine(s))
    lines.push('')
  })
  return lines.join('\n').trimEnd()
}
