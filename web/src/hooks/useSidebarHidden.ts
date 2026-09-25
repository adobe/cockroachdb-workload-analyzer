// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { useCallback, useState } from 'react'
import { readItem, writeItem } from '../storage'

const STORAGE_KEY = 'wa.sidebarHidden'

// useSidebarHidden tracks whether the query list sidebar (Analysis and SQL
// tabs) is hidden to give the results more width. The choice is shared by both
// tabs and persisted, so a reload keeps the layout the user picked.
export function useSidebarHidden() {
  const [hidden, setHidden] = useState(() => readItem(STORAGE_KEY) === '1')

  const toggle = useCallback(() => {
    setHidden(!hidden)
    // Only the hidden state is stored; showing removes the key.
    writeItem(STORAGE_KEY, hidden ? null : '1')
  }, [hidden])

  return { hidden, toggle }
}
