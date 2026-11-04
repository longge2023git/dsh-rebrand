/** Live mini console flows: register, keys, usage, invite rewards, transfer, sign out. */
import { launchBrowser, createUserViaDb, login, markTokenStale, readUsage, uniq } from '../lib.mjs'

const PASSWORD = 'E2ePass12345'

export async function runConsoleLive({ brand, checker, users }) {
  const browser = await launchBrowser()
  const context = await browser.newContext({ locale: brand.locale })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  const inviter = uniq(brand.lang + 'i')
  const invitee = uniq(brand.lang + 'e')
  try {
    // 1. 测试账号（邮箱验证开启后无法用 API 注册，直接建 fixture）
    createUserViaDb(brand.id, inviter, PASSWORD)
    users.push(inviter)
    await login(page, brand.app, inviter, PASSWORD)
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
    const usage = await readUsage(page, brand.app)
    checker.check('fixture 余额 $0.10', usage.balance === '0.10', usage.balance)
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
    // 旧密钥清理：把这个 key 改成"40 天前创建且从未使用"
    const tokenId = await page.evaluate(async () => {
      const uid = JSON.parse(localStorage.getItem('user') || '{}').id
      const data = await (await fetch('/api/token/?p=1&size=100', { headers: { 'New-Api-User': String(uid) } })).json()
      return data?.data?.items?.[0]?.id ?? 0
    })
    if (tokenId > 0) {
      markTokenStale(brand.id, tokenId)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
      await page.waitForTimeout(800)
      checker.check('旧密钥被识别', await page.locator('#stale').isVisible(), `token ${tokenId}`)
      page.once('dialog', (dialog) => dialog.accept())
      await page.click('#stale-clean')
      await page.waitForTimeout(2500)
      checker.check('旧密钥已清理', await page.locator('#stale').isHidden())
    } else {
      checker.check('旧密钥被识别', false, '找不到 token id')
    }

    // 3. 退出 → 受保护页要登录 → 重新登录
    await page.click('#sign-out')
    await page.waitForTimeout(1500)
    checker.check('退出后回到登录页', page.url().includes('/me/login'), page.url())
    await page.goto(`${brand.app}/me/keys`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    checker.check('未登录访问密钥页显示登录提示', !(await page.locator('#auth').isHidden()))
    await login(page, brand.app, inviter, PASSWORD)
    checker.check('用户名重新登录成功', !page.url().includes('/me/login'), page.url())

    // 4. 邀请链路：注册需要邮箱验证码，无法自动化（已在开启验证前人工验证过）
    checker.skip('邀请奖励链路', '注册需邮箱验证码，自动化不可覆盖')

    // 5. 注册闸门：不带验证码必须被拒，发码接口可用
    const gate = await fetch(brand.app + '/api/user/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uniq('g'), password: PASSWORD }),
    }).then((r) => r.json()).catch(() => ({}))
    checker.check('注册必须带验证码', gate?.success === false, JSON.stringify(gate).slice(0, 90))
    // 用本站发信域的地址做探针：Resend 会拒收 example.com 这类测试域。
    const probe = `e2e@mail.${new URL(brand.app).hostname.replace(/^www\./, '')}`
    const send = await fetch(`${brand.app}/api/verification?email=${encodeURIComponent(probe)}`).then((r) => r.json()).catch(() => ({}))
    checker.check('发码接口可用', send?.success === true, JSON.stringify(send).slice(0, 90))
  } finally {
    await browser.close()
  }
}
