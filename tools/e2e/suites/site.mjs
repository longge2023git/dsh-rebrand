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
    // The site now lives on the apex, so "/" is legitimate; only the admin SPA is legacy.
    const legacy = links.filter((href) => new RegExp(`^${appOrigin}/console(/|$)`).test(href))
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

    // 单域名：根路径是官网，www 301 到裸域，控制台仍在 /me/
    const root = await page.goto(`${brand.site}/`, { waitUntil: 'domcontentloaded' })
    const rootTitle = await page.title()
    checker.check('根路径是官网而非旧 SPA', !/New API/i.test(rootTitle), rootTitle.slice(0, 40))
    checker.check('根路径 200', root?.status() === 200, `status=${root?.status()}`)
    const www = brand.site.replace('https://', 'https://www.')
    const wwwResponse = await page.goto(`${www}/docs`, { waitUntil: 'domcontentloaded' }).catch(() => null)
    checker.check('www 301 到裸域', page.url().startsWith(brand.site) && !page.url().includes('//www.'), page.url())
    const consoleResponse = await page.goto(`${brand.app}/console`, { waitUntil: 'domcontentloaded' })
    checker.check('/console 仍是旧控制台（管理员用）', /New API/i.test(await page.title()), (await page.title()).slice(0, 30))

    // Leaving the SPA can abort the next navigation; reset to a blank page first.
    await page.goto('about:blank')
    // 首页主按钮按访客平台显示；Linux/未知回落到中性文案
    {
      const winUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      const winContext = await page.context().browser().newContext({ userAgent: winUa, locale: brand.locale })
      const winPage = await winContext.newPage()
      await winPage.goto(`${brand.site}/`, { waitUntil: 'domcontentloaded' })
      await winPage.waitForTimeout(300)
      const winLabel = (await winPage.locator('[data-download-cta]').innerText()).trim()
      checker.check('首页 CTA 识别 Windows', /Windows/i.test(winLabel), winLabel)
      await winContext.close()

      const linuxUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      const linuxContext = await page.context().browser().newContext({ userAgent: linuxUa, locale: brand.locale })
      const linuxPage = await linuxContext.newPage()
      await linuxPage.goto(`${brand.site}/`, { waitUntil: 'domcontentloaded' })
      await linuxPage.waitForTimeout(300)
      const linuxLabel = (await linuxPage.locator('[data-download-cta]').innerText()).trim()
      checker.check('未知平台回落到中性文案', !/macOS|Windows/i.test(linuxLabel) && linuxLabel.length > 0, linuxLabel)
      await linuxContext.close()
    }

    await page.goto('about:blank')
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
