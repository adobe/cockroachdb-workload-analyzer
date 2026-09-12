# Web theme and accessibility redesign

Date: 2026-09-12
Status: approved design, awaiting implementation plan

## Goal

Replace the current ad-hoc dark stylesheet with a token-based theme system
that meets WCAG contrast targets, offers light and dark themes plus a
high-contrast variant of each, raises the type floor to 12 px, and gives the
tool its own visual identity: a dense data-tool layout in the spirit of
CockroachDB's console, with a teal accent and neutral grays that are clearly
not Cockroach's purple brand.

## Non-goals

- No CSS framework. Plain CSS with custom properties.
- No density switch. One spacing scale.
- No restyling of Monaco's internal widgets (find box, suggest popup) beyond
  what its base themes provide.
- No changes to layout structure, component boundaries, or behavior other
  than what theming requires.

## Decisions already made

| Question | Decision |
|---|---|
| Theme support | Dark and light, with a visible selector in the meta bar, stored in local storage, defaulting to OS preference |
| Contrast target | WCAG AA for default themes, plus a high-contrast variant of each that is auto-selected on `prefers-contrast: more` and also user-selectable |
| Type and density | Base 14 px, nothing below 12 px, slightly more padding, no density toggle |
| Accent | Teal. Blue stays free for future informational use, amber and red remain warning and error |
| Implementation | Semantic tokens in plain CSS, `data-theme` attribute on the html element |

## Current state

- `web/src/index.css`: 112 lines, eight custom properties, flat class
  selectors, hard-coded hover colors, font sizes from 10 px to 16 px.
- `web/src/App.css`: Vite scaffold leftover, not imported. Delete.
- `web/src/assets/{hero.png,react.svg,vite.svg}`: scaffold leftovers, not
  imported. Delete.
- Monaco is hard-wired to `vs-dark` in `SqlTab.tsx`.
- Measured contrast today: text tiers pass AA, but borders and sort glyphs
  sit at 1.6:1 against the surface, and hover backgrounds are nearly
  indistinguishable from rest. The perceived low contrast is structural, not
  textual.

## Section 1: Tokens and palettes

### Token roles

Every component rule consumes only these semantic names. No hex value may
appear outside `tokens.css`.

| Token | Role | Contrast target |
|---|---|---|
| `--bg-base` | Page background | n/a |
| `--bg-surface` | Panels, bars, sticky headers | n/a |
| `--bg-raised` | Hover state for rows, list items, buttons | n/a |
| `--bg-selected` | Active list item, active row; accent-tinted | n/a |
| `--border-subtle` | Dividers between panels; decorative | none |
| `--border-strong` | Control outlines, resting sort glyphs, drawer resize handle | 3:1 (4.5:1 in hc) on base and surface |
| `--text-primary` | Content | 4.5:1 (7:1 in hc) on every bg tier |
| `--text-secondary` | Labels, descriptions | same |
| `--text-muted` | Hints, null markers, eyebrow labels | same |
| `--accent` | Links, active tab, run button border and text | 4.5:1 on every bg tier |
| `--accent-fg` | Text placed on an accent-filled control | 4.5:1 on `--accent` |
| `--accent-bg` | Soft tinted fill (active query item, run button fill) | `--accent` at 4.5:1 on it |
| `--danger`, `--danger-bg` | Error banners, error results | `--danger` at 4.5:1 on surface and on `--danger-bg` |
| `--warning`, `--warning-bg` | Missing-tables banner, unfiltered index note | same pattern |
| `--success`, `--success-bg` | Reserved for positive states | same pattern |
| `--focus-ring` | `:focus-visible` outline on every interactive element | 3:1 (4.5:1 in hc) on base and surface |

### Palette values

Verified with the WCAG 2.x relative-luminance formula. All values below meet
the targets in the table above.

```
dark
  bg-base #0f1317   bg-surface #171c22   bg-raised #20272f   bg-selected #16302f
  border-subtle #2a323b   border-strong #6e7a88
  text-primary #e9eef3   text-secondary #aab5c1   text-muted #8d9aa8
  accent #3fd1bc   accent-fg #062421   accent-bg #12312e
  danger #ff7b72   warning #f0b429   success #57d16e   focus-ring #5fe3cf

light
  bg-base #f6f8fa   bg-surface #ffffff   bg-raised #eef1f4   bg-selected #e0f5f2
  border-subtle #d5dbe1   border-strong #788493
  text-primary #1b2129   text-secondary #4a5564   text-muted #5f6b78
  accent #0a6b60   accent-fg #ffffff   accent-bg #d8f3ef
  danger #b3261e   warning #8a5a00   success #15702f   focus-ring #0a6b60

dark-hc
  bg-base #000000   bg-surface #0b0f13   bg-raised #1a2027   bg-selected #0f2f2b
  border-subtle #5a646f   border-strong #9aa5b1
  text-primary #ffffff   text-secondary #e0e6ec   text-muted #c0c9d2
  accent #5ff0da   accent-fg #000000   accent-bg #0f3a35
  danger #ff9a93   warning #ffd166   success #7ee597   focus-ring #ffffff

light-hc
  bg-base #ffffff   bg-surface #ffffff   bg-raised #e8ecf0   bg-selected #cdeee8
  border-subtle #6b7682   border-strong #2b333b
  text-primary #000000   text-secondary #1f262e   text-muted #333c46
  accent #04524a   accent-fg #ffffff   accent-bg #cdeee8
  danger #8f1d17   warning #5a3a00   success #0a4d1f   focus-ring #000000
```

The `*-bg` soft fills for danger, warning, and success are derived during
implementation as the state color at low alpha over `--bg-surface`, then
checked by the contrast test. In the high-contrast themes `--border-subtle`
is deliberately raised to 3:1 or better so panel edges do not depend on
tonal difference.

Measured minimums per theme (lowest ratio in each class):

| Theme | Text tiers | Non-text | Note |
|---|---|---|---|
| dark | 4.75 | 3.21 | |
| light | 4.79 | 3.35 | |
| dark-hc | 7.04 | 5.74 | |
| light-hc | 7.07 | 10.36 | success measures 6.5 on `bg-selected`, where it is never shown |

## Section 2: Theme resolution and selector

### Storage and attribute

The html element carries `data-theme` with one of `dark`, `light`,
`dark-hc`, `light-hc`. The token file has one block per value. A stored
preference lives in local storage under a single key; its absence means
"follow system".

### Resolution order

1. Stored preference, if present and one of the four values.
2. Otherwise `prefers-color-scheme` selects dark or light, and
   `prefers-contrast: more` upgrades to the `-hc` variant.

While nothing is stored the hook subscribes to both media queries and
re-resolves on change. Once a preference is stored the media queries are
ignored until the user chooses "Follow system", which clears storage.

### No-flash bootstrap

`index.html` includes a small inline classic script, placed in `<head>`,
that runs the resolution before first paint and sets `data-theme` and
`color-scheme` on the html element. It must be a classic script, not a
module: module scripts are deferred and would still let the default theme
paint first. Because a classic inline script cannot import `src/theme.ts`,
the resolution logic is intentionally duplicated there in a few lines with a
comment pointing at `theme.ts`. To keep the two in sync, the `useTheme`
test extracts the inline script text from `index.html`, evaluates it under
the same mocked `matchMedia` and local storage cases, and asserts it sets
the same theme that `resolveTheme()` returns.

### Selector control

A native `<select>` in the meta bar, next to the database picker, with five
options: Follow system, Dark, Light, Dark high contrast, Light high
contrast. It shows the effective theme as a hint when "Follow system" is
selected. Native select gives keyboard and screen-reader behavior for free;
it is styled with the tokens like the existing database picker.

### Files

- `src/theme.ts`: theme names, labels, storage key, `resolveTheme()`.
- `src/hooks/useTheme.ts`: React hook returning `{ theme, preference, setPreference }`.
- `src/components/ThemeSelect.tsx`: the select.

## Section 3: Type and spacing scale

### Type tokens

| Token | Size | Used for |
|---|---|---|
| `--text-lg` | 15 px | Analysis header title, drawer title |
| `--text-md` | 14 px | Body: table cells, list items, toolbars, buttons, banners, editor |
| `--text-sm` | 13 px | Descriptions, results meta line, drawer stat labels |
| `--text-xs` | 12 px | Category eyebrows, export buttons |

No other font size may appear in the stylesheet. Body line height is 1.5.
`--font-mono` is the system monospace stack, shared by the editor, the
fingerprint links, and drawer statement text.

### Spacing tokens

`--space-1` 4 px, `--space-2` 8 px, `--space-3` 12 px, `--space-4` 16 px,
`--space-6` 24 px. Table rows use 6 px vertical padding, query list items
8 px, panel headers 12 px. The query list and SQL sidebar widen from 220 px
to 240 px.

### Hierarchy cues that do not rely on color

- Meta bar and tab bar: strong bottom border.
- Sticky table header: strong bottom border, uppercase eyebrow style.
- Active tab: 2 px accent underline and primary text color.
- Sort glyph at rest: `--border-strong`; hover `--text-secondary`; active `--accent`.

### Focus, hover, motion

- Every button, link, select, and list item: 2 px `--focus-ring` outline
  with 2 px offset on `:focus-visible`.
- Hover: `--bg-raised`. Active: `--bg-selected` with accent text.
- `--radius-sm` 6 px for controls, `--radius-md` 8 px for the drawer.
- The 200 ms drawer transition is wrapped in
  `@media (prefers-reduced-motion: no-preference)`.

## Section 4: Monaco integration

- `src/monacoThemes.ts` registers four custom themes with `defineTheme`,
  each inheriting from the matching base: `vs-dark`, `vs`, `hc-black`,
  `hc-light`. Overrides cover `editor.background`, `editor.foreground`,
  `editorLineNumber.foreground`, `editor.lineHighlightBackground`,
  `editor.selectionBackground`, `editorCursor.foreground`, and
  `focusBorder`. Syntax colors are inherited from the base.
- Override values are read from the live custom properties with
  `getComputedStyle(document.documentElement)`, so `tokens.css` remains the
  single source of truth.
- `MonacoEditor.tsx` gains one effect: when the `theme` prop changes, call
  `monaco.editor.setTheme`. All other props stay initial-only.
- `SqlTab.tsx` passes the Monaco theme name derived from `useTheme()`.
- Editor `fontSize` and `fontFamily` come from `--text-md` and
  `--font-mono` via computed style.

## Section 5: Files and testing

### Stylesheet layout

Imported from `main.tsx` in this order:

- `src/styles/tokens.css`: the four theme blocks, type, spacing, radius.
  The only file allowed to contain hex values.
- `src/styles/base.css`: reset, body, focus ring rule, reduced-motion
  wrapper, `color-scheme`.
- `src/styles/components.css`: all component rules from today's
  `index.css`, rewritten against tokens.

`src/index.css`, `src/App.css`, and `src/assets/*` are deleted.

### New tests (Vitest, existing jsdom setup)

- `src/styles/tokens.test.ts`: parses `tokens.css`, resolves each theme
  block, and asserts the contrast matrix from Section 1. Thresholds: 4.5
  text and 3.0 non-text for `dark` and `light`; 7.0 and 4.5 for the `-hc`
  pair. State colors are checked against `--bg-surface` and their own soft
  background only. Also asserts no hex literal exists in `base.css` or
  `components.css`, and no `font-size` outside the type tokens.
- `src/hooks/useTheme.test.ts`: stored value wins; OS dark plus contrast
  yields `dark-hc`; media change updates only while nothing is stored;
  "Follow system" clears storage.
- `src/components/ThemeSelect.test.tsx`: five options, reflects current
  preference, calls setter on change.

### Existing tests

Updated where they assert on class names or the `vs-dark` prop. The SQL tab
test already mocks the editor wrapper; `monacoThemes` gets a mock too. Go
tests for asset budget and no-CDN references are unaffected.

### Manual verification

After `make build`, open the app in Chrome and, for each of the four themes,
screenshot the analysis tab, the SQL tab with the editor, and the
fingerprint drawer. Confirm the selector persists across reload and that
"Follow system" tracks an OS theme change.
