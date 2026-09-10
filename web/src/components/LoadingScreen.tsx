// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import type { StatusResult } from '../api'

interface Props {
  status: StatusResult
}

export function LoadingScreen({ status }: Props) {
  const pct = Math.round(status.progress * 100)
  const lastLoaded = status.tables.filter(t => t.loaded).at(-1)

  return (
    <div className="loading-screen">
      <h2>Loading workload export...</h2>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">{pct}%{lastLoaded ? ` — ${lastLoaded.name}` : ''}</p>
      {status.tables.some(t => t.error && t.error !== 'not in export') && (
        <ul className="load-errors">
          {status.tables.filter(t => t.error && t.error !== 'not in export').map(t => (
            <li key={t.name}>{t.name}: {t.error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
