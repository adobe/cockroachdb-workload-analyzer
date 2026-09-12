// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Guards the two rules that keep theming honest: colors exist only in
// tokens.css, and every font size comes from the type scale.

const FILES = ['base.css', 'components.css']

function read(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe.each(FILES)('%s', file => {
  const css = read(file)

  it('contains no color literals', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
  })

  it('uses only type-scale tokens for font-size', () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map(m => m[1].trim())
    for (const s of sizes) expect(s, s).toMatch(/^(var\(--text-(lg|md|sm|xs)\)|inherit)$/)
  })
})
