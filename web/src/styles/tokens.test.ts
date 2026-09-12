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

// Parses tokens.css and checks every theme block against the WCAG 2.x
// contrast targets from the design spec. A palette tweak that drops a tier
// below threshold fails here instead of shipping.

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

type Vars = Record<string, string>

function themeBlocks(source: string): Record<string, Vars> {
  const out: Record<string, Vars> = {}
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const block of stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const name = block[1].match(/data-theme="([a-z-]+)"/)?.[1]
    if (!name) continue
    const vars: Vars = {}
    for (const v of block[2].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      vars[v[1]] = v[2].toLowerCase()
    }
    out[name] = vars
  }
  return out
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = c.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const THEMES = ['dark', 'light', 'dark-hc', 'light-hc'] as const
const BG_TIERS = ['bg-base', 'bg-surface', 'bg-raised', 'bg-selected']
const TEXT_TIERS = ['text-primary', 'text-secondary', 'text-muted', 'accent']
const STATES = ['danger', 'warning', 'success']
const REQUIRED = [
  ...BG_TIERS, 'border-subtle', 'border-strong', ...TEXT_TIERS, 'accent-fg', 'accent-bg',
  ...STATES, ...STATES.map(s => `${s}-bg`), 'focus-ring',
]

function thresholds(theme: string) {
  return theme.endsWith('-hc') ? { text: 7, nonText: 4.5 } : { text: 4.5, nonText: 3 }
}

const blocks = themeBlocks(css)

describe('tokens.css', () => {
  it('defines all four themes', () => {
    expect(Object.keys(blocks).sort()).toEqual([...THEMES].sort())
  })

  describe.each(THEMES)('%s', theme => {
    const t = blocks[theme]
    const { text, nonText } = thresholds(theme)

    it('defines every required token as a 6-digit hex', () => {
      for (const name of REQUIRED) expect(t[name], name).toMatch(/^#[0-9a-f]{6}$/)
    })

    it.each(TEXT_TIERS)('%s meets the text threshold on every background tier', tier => {
      for (const bg of BG_TIERS) {
        expect(contrast(t[tier], t[bg]), `${tier} on ${bg}`).toBeGreaterThanOrEqual(text)
      }
    })

    it.each(STATES)('%s meets the text threshold on surface and its own soft background', state => {
      expect(contrast(t[state], t['bg-surface']), `${state} on bg-surface`).toBeGreaterThanOrEqual(text)
      expect(contrast(t[state], t[`${state}-bg`]), `${state} on ${state}-bg`).toBeGreaterThanOrEqual(text)
      expect(contrast(t['text-primary'], t[`${state}-bg`]), `text-primary on ${state}-bg`).toBeGreaterThanOrEqual(text)
    })

    it('accent-fg is readable on accent, and accent on accent-bg', () => {
      expect(contrast(t['accent-fg'], t['accent'])).toBeGreaterThanOrEqual(text)
      expect(contrast(t['accent'], t['accent-bg'])).toBeGreaterThanOrEqual(text)
    })

    it.each(['border-strong', 'focus-ring'])('%s meets the non-text threshold on base and surface', name => {
      expect(contrast(t[name], t['bg-base']), `${name} on bg-base`).toBeGreaterThanOrEqual(nonText)
      expect(contrast(t[name], t['bg-surface']), `${name} on bg-surface`).toBeGreaterThanOrEqual(nonText)
    })

    if (theme.endsWith('-hc')) {
      it('border-subtle is perceivable in high contrast', () => {
        expect(contrast(t['border-subtle'], t['bg-base'])).toBeGreaterThanOrEqual(3)
        expect(contrast(t['border-subtle'], t['bg-surface'])).toBeGreaterThanOrEqual(3)
      })
    }
  })
})
