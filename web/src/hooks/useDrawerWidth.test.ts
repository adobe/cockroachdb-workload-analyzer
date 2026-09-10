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
import { clampDrawerWidth } from './useDrawerWidth'

describe('clampDrawerWidth', () => {
  it('clamps to the 320px minimum', () => {
    expect(clampDrawerWidth(100, 1600)).toBe(320)
  })

  it('clamps to 90% of the viewport maximum', () => {
    expect(clampDrawerWidth(5000, 1000)).toBe(900)
  })

  it('passes a width in range through (rounded)', () => {
    expect(clampDrawerWidth(512.4, 1600)).toBe(512)
  })

  it('never returns below the minimum even on a tiny viewport', () => {
    expect(clampDrawerWidth(50, 200)).toBe(320)
  })
})
