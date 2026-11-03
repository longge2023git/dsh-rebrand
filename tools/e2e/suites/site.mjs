/** Marketing site: pages, language, download metadata, windows slot, 404, legacy links. */
import { launchBrowser } from '../lib.mjs'

const PAGES = ['/', '/download', '/docs', '/en/', '/en/download', '/en/docs']

export async function runSite({ brand, checker }) {
  const browser = await launchBrowser()
  const page = await (await browser.newContext({ locale: brand.locale })).newPage()
  try {
    for (const path of PAGES) {
      const response = await page.goto(brand.site + path, { waitUntil: 'domcontentloaded' }).catch(() => null)
      checker.check(`site ${path} 200`, response?.status() === 200, `status=${response?.status()}`)
    }

    await page.goto(brand.site + '/', { waitUntil: 'domcontentloaded' })
    checker.check('首页语言/方向', (await page.evaluate(() => document.documentElement.lang)) === brand.lang
      && (await page.evaluate(() => document.documentElement.dir)) === brand.dir)

    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href))
    const appOrigin = brand.app.replace(/\/$/, '')
    const legacy = links.filter((href) => href === appOrigin + '/'
      // Apex-only legacy paths; /me/login and /me/register are the mini console.
      || new RegExp(`^${appOrigin}/(console|login|register)(/|$)`).test(href))
    checker.check('首页无老 SPA 链接', legacy.length === 0, legacy.join(',') || '0 个')

    await page.goto(brand.site + '/download', { waitUntil: 'domcontentloaded' })
    const download = await page.evaluate(() => ({
      version: (document.body.innerText.match(/0\.2\.1-rc\.2\.\d{8}\.\d/) ?? [])[0],
      sha: (document.body.innerText.match(/[0-9a-f]{64}/) ?? [])[0],
      windowsSlot: Boolean(document.getElementById('win-card')),
    }))
    checker.check('下载页显示版本', Boolean(download.version), download.version)
    checker.check('下载页显示 SHA-256', Boolean(download.sha), download.sha?.slice(0, 12))
    checker.check('存在 Windows 下载位（清单驱动）', download.windowsSlot)

    const cards = await page.$$eval('.dl-card', (els) => els
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => ({ id: el.id || 'platform', title: el.querySelector('h3')?.textContent?.trim() ?? '' })))
    const titles = cards.map((card) => card.title)
    checker.check('下载卡片不重复', new Set(titles).size === titles.length, titles.join(' | '))
    const soonVisible = await page.evaluate(() => {
      const soon = document.getElementById('win-soon')
      const card = document.getElementById('win-card')
      return Boolean(soon && card && !card.hidden && soon.getBoundingClientRect().height > 0)
    })
    checker.check('Windows 卡片不与"即将推出"同时出现', !soonVisible)

    await page.click('.lang a')
    await page.waitForTimeout(1000)
    checker.check('语言切换生效', (await page.evaluate(() => document.documentElement.lang)) === 'en')
    await page.click('.lang a')
    await page.waitForTimeout(1000)
    checker.check('语言切回本语言', (await page.evaluate(() => document.documentElement.lang)) === brand.lang)

    const topUp = await page.goto(`${brand.app}/top_up`, { waitUntil: 'domcontentloaded' })
    checker.check('充值入口跳到迷你站充值页', page.url().includes('/me/topup'), page.url())
    checker.check('充值页可访问', topUp?.status() === 200, `status=${topUp?.status()}`)

    const notFound = await page.goto(`${brand.site}/no-such-page-${Date.now()}`, { waitUntil: 'domcontentloaded' })
    checker.check('404 状态码', notFound?.status() === 404, `status=${notFound?.status()}`)
    checker.check('404 是品牌页', await page.locator('h1').first().isVisible())
  } finally {
    await browser.close()
  }
}
