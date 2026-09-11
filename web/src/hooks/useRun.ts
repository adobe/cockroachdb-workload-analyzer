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
import { runQuery } from '../api'
import type { RunResult } from '../api'

export function useRun() {
  const [result, setResult] = useState<RunResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async (sql: string) => {
    setLoading(true)
    setResult(null)
    try {
      const r = await runQuery(sql)
      setResult(r)
    } catch (err) {
      // A rejected runQuery (HTTP failure, network error) would otherwise be an
      // unhandled rejection that leaves the pane on "No results". Surface it
      // through ResultsTable's error state instead.
      console.error(err)
      setResult({ columns: [], rows: [], duration_ms: 0, error: 'Query failed to run. The server may be unavailable — try reloading.' })
    } finally {
      setLoading(false)
    }
  }, [])

  return { result, loading, run }
}
