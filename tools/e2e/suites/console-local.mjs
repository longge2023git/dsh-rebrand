/** UI behavior of the mini console against mocked APIs: no network, no data. */
import { Checker, launchBrowser, register } from '../lib.mjs'

const STATUS_OFF = { success: true, data: { quota_per_unit: 500000, email_verification: false } }
const STATUS_ON = { success: true, data: { quota_per_unit: 500000, email_verification: true } }
const SELF = { success: true, data: { id: 7, username: 'e2e', quota: 50000, used_quota: 0, request_count: 0, aff_code: 'ABCD', aff_count: 0, aff_quota: 0 } }

async function withPage(browser, { locale, status, calls = [], signedIn = false, complete = 200 }) {
  const context = await browser.newContext({ locale })
  const page = await context.newPage()
  await page.route('**/api/status', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(status) }))
  await page.route('**/api/user/self', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(SELF) }))
  await page.route('**/api/user/login', async (route) => {
    calls.push('login')
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 7, username: 'e2e' } }) })
  })
  await page.route('**/api/user/register', async (route) => {
    calls.push('register:' + String(route.request().postData() ?? ''))
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  await page.route('**/api/user/logout', async (route) => {
    calls.push('logout')
    await route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
  })
  await page.route('**/api/token/**', async (route) => {
    const method = route.request().method()
    calls.push(`token:${method}:${route.request().headers()['new-api-user'] ?? ''}`)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: method === 'GET' ? [] : undefined } }) })
  })
  await page.route('**/api/verification**', async (route) => {
    calls.push('verification:' + new URL(route.request().url()).search)
    await route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
  })
  await page.route('**/api/dsh/complete', async (route) => {
    calls.push('complete:' + String(route.request().postData() ?? ''))
    if (complete !== 200) {
      return route.fulfill({ status: complete, contentType: 'application/json', body: JSON.stringify({ error: { message: '该账号启用了两步验证' } }) })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data: { biz_code: 0, biz_data: { redirect: 'http://127.0.0.1:PORT/me/dsh?tx=T#done' } } }) })
  })
  if (signedIn) {
    // Seed the session once per context: re-seeding on every load would hide a
    // broken sign-out that fails to clear localStorage.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e-seeded')) return
      localStorage.setItem('user', JSON.stringify({ id: 7, username: 'e2e' }))
      sessionStorage.setItem('e2e-seeded', '1')
    })
  }
  return { page, context, calls }
}

export async function runConsoleLocal({ base, brand, checker }) {
  const browser = await launchBrowser()
  try {
    // 1. 注册页：字段与密码眼睛
    {
      const { page, context } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF })
      await page.goto(`${base}/me/register`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      checker.check('注册页有用户名/密码/确认/邀请码字段', (await page.locator('input[name="username"]').count()) === 1
        && (await page.locator('input[name="confirm"]').count()) === 1
        && (await page.locator('input[name="aff"]').count()) === 1)
      checker.check('验证关闭时隐藏邮箱字段', await page.evaluate(() => document.getElementById('email-field').hidden))
      checker.check('两个密码框各有一个小眼睛', (await page.locator('[data-eye]').count()) === 2)
      await page.fill('input[name="password"]', 'Secret123')
      await page.locator('[data-eye]').first().click()
      const revealed = await page.evaluate(() => ({
        type: document.querySelector('input[name="password"]').type,
        confirm: document.querySelector('input[name="confirm"]').type,
        pressed: document.querySelectorAll('[data-eye]')[0].getAttribute('aria-pressed'),
      }))
      checker.check('眼睛切换只影响当前框且更新 aria', revealed.type === 'text' && revealed.confirm === 'password' && revealed.pressed === 'true', JSON.stringify(revealed))
      await context.close()
    }

    // 2. 注册校验与提交流程
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF })
      await page.goto(`${base}/me/register`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      await page.fill('input[name="username"]', 'x'.repeat(21))
      await page.fill('input[name="password"]', 'Password123')
      await page.fill('input[name="confirm"]', 'Password123')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(400)
      checker.check('超长用户名被本地拦截', (await page.locator('#error').innerText()).trim().length > 0 && calls.length === 0)
      await page.fill('input[name="username"]', 'okname')
      await page.fill('input[name="password"]', 'short')
      await page.fill('input[name="confirm"]', 'short')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(300)
      checker.check('短密码被本地拦截', calls.length === 0)
      await page.fill('input[name="password"]', 'Password123')
      await page.fill('input[name="confirm"]', 'Password124')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(300)
      checker.check('两次密码不一致被拦截', calls.length === 0)
      await page.fill('input[name="confirm"]', 'Password123')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(800)
      const payload = calls.find((c) => c.startsWith('register:')) || ''
      checker.check('提交载荷不含邮箱（验证关闭时）', payload.length > 0 && !payload.includes('"email"'), payload.slice(0, 90))
      checker.check('密码不出现在 URL', !page.url().includes('Password123'), page.url())
      await context.close()
    }

    // 3. 邮箱验证开关：字段与发码
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_ON })
      await page.goto(`${base}/me/register`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(700)
      checker.check('验证开启时显示邮箱字段', !(await page.evaluate(() => document.getElementById('email-field').hidden)))
      await page.fill('input[name="username"]', 'okname')
      await page.fill('input[name="password"]', 'Password123')
      await page.fill('input[name="confirm"]', 'Password123')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(300)
      checker.check('缺邮箱被本地拦截', calls.length === 0)
      await page.fill('input[name="email"]', 'user@example.com')
      await page.click('#send-code')
      await page.waitForTimeout(600)
      checker.check('发送验证码请求正确', calls.some((c) => c.includes('verification:?email=user%40example.com')), calls.find((c) => c.startsWith('verification')) || '无')
      await page.fill('input[name="code"]', '123456')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(700)
      const payload = calls.find((c) => c.startsWith('register:')) || ''
      checker.check('提交载荷带 email + verification_code', payload.includes('"email":"user@example.com"') && payload.includes('"verification_code":"123456"'), payload.slice(0, 120))
      await context.close()
    }

    // 4. 查询串在跳转间保留
    {
      const { page, context } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF })
      await page.goto(`${base}/me/dsh?tx=TX1&theme=light`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      const en = await page.locator('[data-lang-link="en"]').getAttribute('href')
      checker.check('dsh 页切语言保留 tx', en.includes('tx=TX1') && en.includes('theme=light'), en)
      const reg = await page.locator('#register-link').getAttribute('href')
      checker.check('dsh 页注册链接带 dsh', reg.includes('dsh=TX1'), reg)
      await page.goto(`${base}/me/login?dsh=TX1&next=/me/keys`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      const toReg = await page.locator('[data-carry]').first().getAttribute('href')
      checker.check('登录→注册保留 dsh 与 next', toReg.includes('dsh=TX1') && toReg.includes('next=/me/keys'), toReg)
      await context.close()
    }

    // 5. 密钥页：请求头与增删
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      await page.goto(`${base}/me/keys`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(600)
      checker.check('密钥列表请求带 New-Api-User', calls.some((c) => c.startsWith('token:GET:7')), calls.join(' | ') || '无')
      await page.fill('#name', 'e2e-key')
      await page.click('#create button[type="submit"]')
      await page.waitForTimeout(800)
      checker.check('创建密钥调用 POST', calls.some((c) => c.startsWith('token:POST:7')), calls.join(' | '))
      await context.close()
    }

    // 6. 退出登录
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      await page.goto(`${base}/me/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      checker.check('登录态显示退出按钮', await page.locator('#sign-out').isVisible())
      await page.click('#sign-out')
      await page.waitForTimeout(1200)
      checker.check('退出调用接口并清本地并跳登录页', calls.includes('logout')
        && (await page.evaluate(() => localStorage.getItem('user'))) === null
        && page.url().includes('/me/login'), page.url())
      await context.close()
    }

    // 7. 桌面登录：已登录直接完成 / 2FA 提示
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      await page.goto(`${base}/me/dsh?tx=TX1`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      checker.check('已登录直接完成事务', calls.some((c) => c.startsWith('complete:')), calls.join(' | ') || '无')
      await context.close()
    }
    {
      const { page, context } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true, complete: 409 })
      await page.goto(`${base}/me/dsh?tx=TX1`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const text = (await page.locator('#dsh-state').innerText()).trim()
      checker.check('2FA 错误有本地化提示', text.length > 0, text.slice(0, 40))
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
