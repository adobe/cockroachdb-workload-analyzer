// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { QUERY_SIDEBAR_ID } from '../tabIds'

interface Props {
  hidden: boolean
  onToggle: () => void
  // False on tabs without a query list (Schema). The button stays in place,
  // disabled, so the tabs next to it don't shift when switching tabs.
  available: boolean
}

// Hides or shows the query list sidebar, to give the results more width. A
// disclosure button: aria-expanded mirrors the sidebar, aria-controls names it.
export function SidebarToggle({ hidden, onToggle, available }: Props) {
  const label = hidden ? 'Show query list' : 'Hide query list'
  return (
    <button
      className="sidebar-toggle"
      onClick={onToggle}
      disabled={!available}
      aria-label={label}
      aria-expanded={available ? !hidden : undefined}
      aria-controls={available ? QUERY_SIDEBAR_ID : undefined}
      title={available ? `${label} (b)` : 'This tab has no query list'}
    >
      {/* A window with a left panel; the panel is filled while it is shown. */}
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
        <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
        {!hidden && <rect x="2" y="3" width="4" height="10" rx="1" fill="currentColor" opacity="0.5" />}
      </svg>
    </button>
  )
}
