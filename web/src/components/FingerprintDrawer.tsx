// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useEffect, useRef, useState } from 'react'
import { useFingerprintDetail, type StmtDetail } from '../hooks/useFingerprintDetail'
import { useDrawerWidth } from '../hooks/useDrawerWidth'
import { useModal } from '../hooks/useModal'
import { drawerToText, fmtNum, fmtSec } from '../drawerText'

interface Props {
  fingerprint: string | null
  onClose: () => void
}

function StatementCard({ detail }: { detail: StmtDetail }) {
  return (
    <div className="drawer-stmt">
      <pre>{detail.queryText || '(no query text)'}</pre>
      <dl className="drawer-stmt-stats">
        <div><dt>Executions</dt><dd>{fmtNum(detail.executions)}</dd></div>
        <div><dt>Mean run latency</dt><dd>{fmtSec(detail.meanRunLatSec)}</dd></div>
        <div><dt>Contention</dt><dd>{fmtSec(detail.contentionSec)}</dd></div>
        <div><dt>Full scan</dt><dd>{detail.fullScan ? 'yes' : 'no'}</dd></div>
      </dl>
    </div>
  )
}

export function FingerprintDrawer({ fingerprint, onClose }: Props) {
  const { statements, kind, loading, error, lookup } = useFingerprintDetail()
  const { width, startResize } = useDrawerWidth()
  // Derive "copied" from the fingerprint that was copied, so it resets when the
  // drawer content changes without a setState-in-effect (lint: set-state-in-effect).
  const [copiedFor, setCopiedFor] = useState<string | null>(null)
  const copied = copiedFor === fingerprint
  const closeRef = useRef<HTMLButtonElement>(null)
  useModal({ openKey: fingerprint, onClose, closeRef })

  useEffect(() => {
    if (fingerprint) lookup(fingerprint)
  }, [fingerprint, lookup])

  if (!fingerprint) return null

  const isTxn = kind === 'transaction'

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(drawerToText(fingerprint!, kind, statements))
      setCopiedFor(fingerprint)
    } catch {
      setCopiedFor(null)
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div
        className="drawer open"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label="Fingerprint details"
      >
        <div
          className="drawer-resize"
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize drawer"
        />
        <div className="drawer-header">
          <span className="drawer-title" title={fingerprint}>{fingerprint}</span>
          <div className="drawer-header-actions">
            <button
              className="drawer-copy"
              onClick={handleCopy}
              disabled={loading}
              aria-label="Copy drawer contents"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button ref={closeRef} className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        <div className="drawer-body">
          {loading && <div>Resolving...</div>}
          {error && <div className="results-error">{error}</div>}
          {!loading && !error && statements.length === 0 && (
            <div>No query text found for this fingerprint.</div>
          )}
          {!loading && !error && isTxn && statements.length > 0 && (
            <div className="drawer-stmt-label">
              Statements in this transaction ({statements.length}):
            </div>
          )}
          {!loading && !error && statements.map((s, i) => (
            <div key={s.fingerprintId || i}>
              {isTxn && (
                <div className="drawer-stmt-label">Statement {i + 1} of {statements.length}:</div>
              )}
              <StatementCard detail={s} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
