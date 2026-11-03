/** Live mini console flows: register, keys, usage, invite rewards, transfer, sign out. */
import { launchBrowser, login, readUsage, register, uniq } from '../lib.mjs'

const PASSWORD = 'E2ePass12345'

export async function runConsoleLive({ brand, checker, users }) {
  const browser = await launchBrowser()
  const context = await browser.newContext({ locale: brand.locale })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  const inviter = uniq(brand.lang + 'i')
  const invitee = uniq(brand.lang + 'e')
  try {
    // 1. 新用户注册 → 体验额度（这个账号同时充当邀请人）
    await register(page, brand.app, inviter, PASSWORD)
    users.push(inviter)
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
    const usage = await readUsage(page, brand.app)
    checker.check('新用户余额 $0.10', usage.balance === '0.10', usage.balance)
    checker.check('邀请卡片可见且有 4 位邀请码', /^[A-Za-z0-9]{4}$/.test(usage.code), usage.code)
    checker.check('无邀请时无转账按钮', !usage.transfer)

    // 2. 密钥创建与删除
    await page.goto(`${brand.app}/me/keys`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
    await page.fill('#name', 'e2e-key')
    await page.click('#create button[type="submit"]')
    await page.waitForTimeout(2000)
    checker.check('创建密钥', (await page.locator('[data-copy]').count()) >= 1)
    await page.click('[data-edit]')
    await page.waitForTimeout(400)
    await page.fill('#edit-form input[name="name"]', 'renamed-key')
    await page.click('#edit-form button[type="submit"]')
    await page.waitForTimeout(2000)
    checker.check('编辑密钥改名', (await page.locator('#rows').innerText()).includes('renamed-key'), (await page.locator('#rows').innerText()).replace(/\n/g, ' ').slice(0, 60))
    await page.locator('[data-delete]').first().click()
    await page.waitForTimeout(2000)
    checker.check('删除密钥', (await page.locator('#rows').innerText()).trim().length > 0)

    // 3. 退出 → 受保护页要登录 → 重新登录
    await page.click('#sign-out')
    await page.waitForTimeout(1500)
    checker.check('退出后回到登录页', page.url().includes('/me/login'), page.url())
    await page.goto(`${brand.app}/me/keys`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    checker.check('未登录访问密钥页显示登录提示', !(await page.locator('#auth').isHidden()))
    await login(page, brand.app, inviter, PASSWORD)
    checker.check('用户名重新登录成功', !page.url().includes('/me/login'), page.url())

    // 4. 邀请链路（邀请人 = 上面的 inviter）
    const inviterUsage = await readUsage(page, brand.app)
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${brand.app}/me/register?aff=${encodeURIComponent(inviterUsage.code)}`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', invitee)
    await page.fill('input[name="password"]', PASSWORD)
    await page.fill('input[name="confirm"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForURL('**/me/keys', { timeout: 30000 })
    users.push(invitee)
    const inviteeUsage = await readUsage(page, brand.app)
    checker.check('被邀请人余额 $0.60', inviteeUsage.balance === '0.60', inviteeUsage.balance)

    // 5. 邀请人收账与转账
    await page.evaluate(() => localStorage.clear())
    await login(page, brand.app, inviter, PASSWORD)
    const afterInvite = await readUsage(page, brand.app)
    checker.check('邀请人计数 1、额度 $1.00、可转账', afterInvite.credit === '1.00' && afterInvite.transfer, JSON.stringify(afterInvite))
    if (afterInvite.transfer) {
      await page.click('#aff-transfer')
      await page.waitForTimeout(2500)
      const afterTransfer = await readUsage(page, brand.app)
      checker.check('转账后余额 $1.10、额度归零', afterTransfer.balance === '1.10' && afterTransfer.credit === '0.00', JSON.stringify(afterTransfer))
    }
  } finally {
    await browser.close()
  }
}
