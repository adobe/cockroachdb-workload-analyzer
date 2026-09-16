// Records a scripted tour of the workload-analyzer UI with Playwright + the
// installed Google Chrome. Output: out/demo.webm (converted to mp4/gif by encode.sh).
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const URL = process.env.URL || 'http://127.0.0.1:8099'
const OUT = path.join(__dirname, 'out')
const W = 1440, H = 900

const sleep = ms => new Promise(r => setTimeout(r, ms))

// A visible cursor: Playwright videos don't include the OS pointer.
const CURSOR_SCRIPT = `
  (() => {
    const c = document.createElement('div')
    c.id = '__cursor'
    Object.assign(c.style, {
      position: 'fixed', left: '0px', top: '0px', width: '18px', height: '18px',
      zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-2px,-2px)',
      transition: 'transform 60ms linear',
    })
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6.5 1.5L16 20l-3 1-3.5-7.5L5 18z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    const attach = () => document.body ? document.body.appendChild(c) : requestAnimationFrame(attach)
    attach()
    window.addEventListener('mousemove', e => {
      c.style.transform = 'translate(' + (e.clientX - 2) + 'px,' + (e.clientY - 2) + 'px)'
    }, true)
    window.addEventListener('mousedown', () => { c.style.scale = '0.8' }, true)
    window.addEventListener('mouseup', () => { c.style.scale = '1' }, true)
  })()
`

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  })
  await context.addInitScript(CURSOR_SCRIPT)
  const page = await context.newPage()
  const mouse = page.mouse

  // Human-ish helpers -------------------------------------------------------
  let cur = { x: W / 2, y: H / 2 }
  async function moveTo(locator, opts = {}) {
    const box = await locator.boundingBox()
    if (!box) throw new Error('no box for ' + locator)
    const x = box.x + (opts.fx ?? 0.5) * box.width
    const y = box.y + (opts.fy ?? 0.5) * box.height
    const dist = Math.hypot(x - cur.x, y - cur.y)
    await mouse.move(x, y, { steps: Math.max(12, Math.min(40, Math.round(dist / 15))) })
    cur = { x, y }
  }
  async function click(locator, opts = {}) {
    await moveTo(locator, opts)
    await sleep(opts.hover ?? 250)
    await mouse.down(); await sleep(70); await mouse.up()
  }
  async function type(text, delay = 28) {
    await page.keyboard.type(text, { delay })
  }

  // Tour --------------------------------------------------------------------
  await page.goto(URL)
  await mouse.move(cur.x, cur.y)
  await page.getByRole('tab', { name: 'Analysis' }).waitFor()
  await sleep(1400)

  // 1. Analysis: preloaded queries
  const q = name => page.locator('.query-item', { hasText: name })
  await click(q('Slowest by Mean Latency'))
  await page.locator('.results-table').waitFor()
  await sleep(2200)

  await click(q('Full Table Scans'))
  await page.locator('.results-table, .results-state').first().waitFor()
  await sleep(1800)

  await click(q('High Contention Time'))
  await page.locator('.results-table, .results-state').first().waitFor()
  await sleep(1800)

  // 2. Filter by database
  const picker = page.locator('select.db-picker')
  await moveTo(picker)
  await sleep(300)
  await picker.selectOption('movr')
  await sleep(1800)

  // 3. Sort a column (click header twice: asc -> desc)
  await click(q('Slowest by Mean Latency'))
  await page.locator('.results-table').waitFor()
  await sleep(1000)
  const header = page.locator('.results-table th', { hasText: 'total_executions' }).first()
  await click(header)
  await sleep(1200)
  await click(header)
  await sleep(1600)

  // 4. Fingerprint drawer
  const link = page.locator('.fingerprint-link').first()
  await click(link)
  await page.locator('.drawer.open').waitFor()
  await sleep(2600)
  await moveTo(page.locator('.drawer-copy'))
  await sleep(600)
  await click(page.locator('.drawer-close'))
  await sleep(1000)

  // 5. SQL tab: free-form DuckDB
  await click(page.getByRole('tab', { name: 'SQL' }))
  await page.locator('.monaco-editor-container .view-lines').waitFor()
  await sleep(900)
  await click(page.locator('.monaco-editor-container .view-lines'))
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  await sleep(300)
  // Monaco carries the previous line's indentation over on Enter, so type each
  // line separately and outdent before the unindented ones.
  await type('SELECT app_name, COUNT(*) AS fingerprints,')
  await page.keyboard.press('Enter')
  await type('       SUM(CAST(json_extract(statistics, \'$.statistics.cnt\') AS BIGINT)) AS executions')
  await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab')
  await type('FROM stmt_stats')
  await page.keyboard.press('Enter')
  await type('GROUP BY app_name')
  await page.keyboard.press('Enter')
  await type('ORDER BY executions DESC;')
  await sleep(700)
  await page.keyboard.press('Meta+Enter')
  await page.locator('.sql-results .results-table').waitFor()
  await sleep(2400)

  // 6. Schema tab
  await click(page.getByRole('tab', { name: 'Schema' }))
  await page.locator('.schema-content').waitFor()
  await sleep(700)
  const schemaPicker = page.locator('select.db-picker')
  if (await schemaPicker.count()) {
    await moveTo(schemaPicker)
    await sleep(300)
    await schemaPicker.selectOption('movr').catch(() => {})
  }
  await sleep(2000)

  // 7. Keyboard shortcuts: digits switch tabs, ? opens the cheat sheet
  await page.keyboard.press('1')
  await sleep(900)
  await page.keyboard.press('j'); await sleep(450)
  await page.keyboard.press('j'); await sleep(450)
  await page.keyboard.press('j'); await sleep(900)
  await page.keyboard.press('?')
  await page.getByRole('dialog').waitFor()
  await sleep(2600)
  await page.keyboard.press('Escape')
  await sleep(800)

  // 8. Dark theme
  const theme = page.locator('select').filter({ has: page.locator('option[value="dark"]') }).first()
  await moveTo(theme)
  await sleep(300)
  await theme.selectOption('dark')
  await sleep(2600)

  await context.close()
  await browser.close()
  const [file] = fs.readdirSync(OUT).filter(f => f.endsWith('.webm'))
  fs.renameSync(path.join(OUT, file), path.join(OUT, 'demo.webm'))
  console.log('recorded:', path.join(OUT, 'demo.webm'))
}

main().catch(e => { console.error(e); process.exit(1) })
