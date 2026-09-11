// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  ApiError,
  fetchQueries,
  fetchQueriesFull,
  fetchMeta,
  fetchSchema,
  fetchStatus,
  fetchDatabases,
  runQuery,
  runCatalogQuery,
} from './api'

function okResponse(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) }
}

function errorResponse(status = 500, statusText = 'Internal Server Error') {
  // A real error body is often HTML, so json() rejecting must NOT be what we
  // rely on to detect failure — res.ok is.
  return { ok: false, status, statusText, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }
}

describe('api res.ok enforcement', () => {
  beforeEach(() => vi.restoreAllMocks())

  const readers: Array<[string, () => Promise<unknown>]> = [
    ['fetchStatus', fetchStatus],
    ['fetchMeta', fetchMeta],
    ['fetchQueries', fetchQueries],
    ['fetchQueriesFull', fetchQueriesFull],
    ['fetchSchema', fetchSchema],
    ['fetchDatabases', fetchDatabases],
    ['runQuery', () => runQuery('SELECT 1')],
    ['runCatalogQuery', () => runCatalogQuery('q1', 'db')],
  ]

  it.each(readers)('%s rejects with ApiError on a non-2xx response', async (_name, call) => {
    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(503, 'Service Unavailable'))
    await expect(call()).rejects.toBeInstanceOf(ApiError)
  })

  it('ApiError carries the HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(404, 'Not Found'))
    await expect(fetchQueries()).rejects.toMatchObject({ status: 404 })
  })

  it('resolves the parsed body on a 2xx response', async () => {
    const body = [{ id: 'q1', category: 'c', name: 'n', description: 'd' }]
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse(body))
    await expect(fetchQueries()).resolves.toEqual(body)
  })
})
