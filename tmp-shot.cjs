const puppeteer = require('puppeteer')
const DIR = 'C:/Users/petty/AppData/Local/Temp/claude/d--github-project-management-system/589be7c5-4bd3-4253-99fe-059a09c111e3/scratchpad'
const BASE = 'http://127.0.0.1:3123'

;(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  for (const [w, h, tag] of [[1366, 768, '1366x768'], [1600, 900, '1600x900'], [1920, 1080, '1920x1080']]) {
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: h })
    // mock 登入：auth-context 讀 localStorage
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('pms_user', JSON.stringify({
      id: 'u-alice', name: 'alice', email: 'alice@example.com', role: 'admin',
    })))
    await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle2', timeout: 60000 })
    const href = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find(x => /\/projects\/[^/]+$/.test(x.getAttribute('href') || ''))
      return a ? a.getAttribute('href') : null
    })
    if (!href) { console.log(`${tag}: 找不到專案連結`); await page.close(); continue }
    await page.goto(BASE + href, { waitUntil: 'networkidle2', timeout: 60000 })
    // 切到「工作項目」分頁
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('button,[role=tab]')].find(b => b.textContent?.includes('工作項目'))
      t?.click()
    })
    await new Promise(r => setTimeout(r, 1500))
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '顯示設定')
      if (!b) return false
      b.click(); return true
    })
    if (!clicked) { console.log(`${tag}: 找不到「顯示設定」按鈕`); await page.close(); continue }
    await new Promise(r => setTimeout(r, 700))
    // 切到「日期標記」分頁
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('[role=tab]')].find(b => b.textContent?.includes('日期標記'))
      t?.click()
    })
    await new Promise(r => setTimeout(r, 700))
    const info = await page.evaluate(() => {
      const panel = document.querySelector('[role=tabpanel][data-state=active]')
      if (!panel) return null
      const list = panel.querySelector('div[class*="overflow-y-auto"]')
      const root = panel.closest('[role=dialog]')
      return {
        kind: root?.getAttribute('data-radix-popper-content-wrapper') != null ? '?' : (root?.className || '').includes('max-h-[85vh]') ? 'Dialog' : 'Popover',
        panelH: Math.round(panel.getBoundingClientRect().height),
        listH: list ? Math.round(list.getBoundingClientRect().height) : 0,
        rootW: root ? Math.round(root.getBoundingClientRect().width) : 0,
        rootH: root ? Math.round(root.getBoundingClientRect().height) : 0,
      }
    })
    console.log(`${tag}:`, JSON.stringify(info))
    await page.screenshot({ path: `${DIR}/ui-${tag}.png` })
    await page.close()
  }
  await browser.close()
})().catch(e => { console.error(e.message); process.exit(1) })
