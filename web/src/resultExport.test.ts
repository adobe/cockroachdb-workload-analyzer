// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { describe, expect, it } from 'vitest'
import { toCSV, toJSON } from './resultExport'

describe('toCSV', () => {
  it('writes a header and rows', () => {
    expect(toCSV(['a', 'b'], [[1, 'x'], [2, 'y']])).toBe('a,b\n1,x\n2,y')
  })

  it('emits just the header for zero rows', () => {
    expect(toCSV(['a', 'b'], [])).toBe('a,b')
  })

  it('quotes and escapes fields with commas, quotes, or newlines', () => {
    const csv = toCSV(['q'], [['a,b'], ['he said "hi"'], ['line1\nline2']])
    expect(csv).toBe('q\n"a,b"\n"he said ""hi"""\n"line1\nline2"')
  })

  it('renders null as an empty field', () => {
    expect(toCSV(['a', 'b'], [[null, 0]])).toBe('a,b\n,0')
  })
})

describe('toJSON', () => {
  it('produces an array of column-keyed objects', () => {
    expect(JSON.parse(toJSON(['id', 'name'], [[1, 'alice'], [2, 'bob']]))).toEqual([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ])
  })

  it('preserves null and does not coerce falsy values', () => {
    expect(JSON.parse(toJSON(['a', 'b', 'c'], [[null, 0, false]]))).toEqual([
      { a: null, b: 0, c: false },
    ])
  })
})
