// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// The app's tabs, and the element ids that pair each tab with its panel
// (aria-controls and aria-labelledby). Shared by App, TabBar and the
// shortcuts catalog, which derives the digit shortcuts from this order.

export type Tab = 'analysis' | 'sql' | 'schema'

export const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'sql', label: 'SQL' },
  { id: 'schema', label: 'Schema' },
]

export function tabId(id: string) {
  return `tab-${id}`
}

export function tabPanelId(id: string) {
  return `tabpanel-${id}`
}
