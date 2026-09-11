// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AnalysisTab } from './AnalysisTab'

describe('AnalysisTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('surfaces an error banner when the query list fails to load', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    })
    render(<AnalysisTab queries={[]} selectedDb="" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
