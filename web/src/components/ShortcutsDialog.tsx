// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { Fragment, useRef } from 'react'
import { SHORTCUT_GROUPS } from '../shortcuts'
import { useModal } from '../hooks/useModal'

interface Props {
  open: boolean
  onClose: () => void
}

// A modal listing every keyboard shortcut. Shares the fingerprint drawer's
// focus contract (useModal); Escape, the close button and the backdrop all
// close it, and Tab cycles inside the dialog while it is open.
export function ShortcutsDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useModal({ openKey: open, onClose, closeRef, trapRef: dialogRef })

  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" data-testid="shortcuts-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="drawer-header">
          <h2 id="shortcuts-title" className="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={closeRef} className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map(group => (
            <section key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <dl className="shortcuts-list">
                {group.shortcuts.map(s => (
                  <div key={s.description}>
                    <dt>
                      {s.keys.map((alt, i) => (
                        <Fragment key={alt}>
                          {i > 0 && <span className="shortcuts-sep">or</span>}
                          {alt.split('+').map((part, j) => (
                            <Fragment key={part}>
                              {j > 0 && <span className="shortcuts-sep">+</span>}
                              <kbd>{part}</kbd>
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </dt>
                    <dd>{s.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
