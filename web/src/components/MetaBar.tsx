// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import type { ReactNode } from 'react'
import type { MetaResult } from '../api'
import { formatTimeRange } from '../format'

interface Props {
  meta: MetaResult | null
  filename: string
  children?: ReactNode
}

export function MetaBar({ meta, filename, children }: Props) {
  return (
    <div className="meta-bar">
      <span className="meta-filename">{filename}</span>
      {meta && (
        <>
          <span className="meta-sep">·</span>
          <span className="meta-version">{meta.cluster_version.replace('CockroachDB CCL ', '')}</span>
          {meta.organization && (
            <>
              <span className="meta-sep">·</span>
              <span className="meta-org">{meta.organization}</span>
            </>
          )}
          {meta.time_range && (
            <>
              <span className="meta-sep">·</span>
              <span
                className="meta-range"
                title={`Export window: ${meta.time_range.start} to ${meta.time_range.end}`}
              >
                {formatTimeRange(meta.time_range.start, meta.time_range.end)}
              </span>
            </>
          )}
        </>
      )}
      {children && <span className="meta-bar-actions">{children}</span>}
    </div>
  )
}
