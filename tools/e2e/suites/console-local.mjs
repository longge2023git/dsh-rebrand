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
      checker.check('验证关闭时显示用户名、隐藏邮箱', await page.evaluate(() => {
        const email = document.getElementById('email-field')
        const user = document.getElementById('username-field')
        return email.hidden && !user.hidden
      }))
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
      checker.check('验证开启时显示邮箱、隐藏用户名', await page.evaluate(() => {
        const email = document.getElementById('email-field')
        const user = document.getElementById('username-field')
        return !email.hidden && user.hidden
      }))
      await page.fill('input[name="password"]', 'Password123')
      await page.fill('input[name="confirm"]', 'Password123')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(300)
      checker.check('缺邮箱被本地拦截', calls.length === 0)
      await page.fill('input[name="email"]', 'user@example.com')
      await page.click('#send-code')
      await page.waitForTimeout(600)
      checker.check('发送验证码请求正确', calls.some((c) => c.includes('verification:?email=user%40example.com')), calls.find((c) => c.startsWith('verification')) || '无')
      await page.fill('input[name="code"]', '29a2b2')  // 验证码是 hex，必须接受 a-f
      await page.click('#auth-form button[type="submit"]')
      await page.waitForTimeout(700)
      const payload = calls.find((c) => c.startsWith('register:')) || ''
      checker.check('提交载荷带 email + hex 验证码 + 派生用户名', payload.includes('"email":"user@example.com"') && payload.includes('"verification_code":"29a2b2"') && /"username":"[a-z0-9]+_[a-z0-9]{4}"/.test(payload), payload.slice(0, 140))
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

    // 7. 充值页：余额、兑换、历史
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      await page.route('**/api/user/topup/self**', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [{ id: 1, amount: 250000, money: 0, payment_method: 'redeem', create_time: 1793600000, status: 'success' }] } }),
      }))
      await page.route('**/api/user/topup', async (route) => {
        calls.push('topup:' + String(route.request().postData() ?? ''))
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: 250000 }) })
      })
      await page.goto(`${base}/me/topup`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(600)
      checker.check('充值页显示余额', (await page.locator('#balance').innerText()).trim() === '0.10', await page.locator('#balance').innerText())
      checker.check('充值页显示历史记录', (await page.locator('#rows tr').count()) === 1)
      await page.fill('#code', 'RDM-1')
      await page.click('#redeem button[type="submit"]')
      await page.waitForTimeout(800)
      checker.check('兑换码请求正确', calls.some((c) => c === 'topup:{"key":"RDM-1"}'), calls.join(' | '))
      checker.check('兑换后有提示', !(await page.locator('#message').isHidden()))
      await context.close()
    }

    // 8. 账号安全：改密码 / 忘记密码 / 重置
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      await page.route('**/api/user/password', async (route) => {
        calls.push('password:' + String(route.request().postData() ?? ''))
        await route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
      })
      await page.route('**/api/reset_password**', async (route) => {
        calls.push('reset_send')
        await route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
      })
      await page.route('**/api/user/reset', async (route) => {
        calls.push('reset:' + String(route.request().postData() ?? ''))
        await route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":"Ab3dE5fG7hJ9"}' })
      })
      await page.goto(`${base}/me/account`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      checker.check('账号页三个密码框都有眼睛', (await page.locator('[data-eye]').count()) === 3)
      await page.fill('input[name="current"]', 'OldPass123')
      await page.fill('input[name="password"]', 'short')
      await page.fill('input[name="confirm"]', 'short')
      await page.click('#password-form button[type="submit"]')
      await page.waitForTimeout(300)
      checker.check('改密码本地拦截短密码', !calls.some((c) => c.startsWith('password:')))
      await page.fill('input[name="password"]', 'NewPass123')
      await page.fill('input[name="confirm"]', 'NewPass123')
      await page.click('#password-form button[type="submit"]')
      await page.waitForTimeout(700)
      checker.check('改密码请求正确', calls.some((c) => c === 'password:{"original_password":"OldPass123","password":"NewPass123"}'), calls.join(' | '))
      checker.check('改密码成功提示', await page.locator('#saved').isVisible())

      await page.goto(`${base}/me/forgot`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[name="email"]', 'user@example.com')
      await page.click('#forgot-form button[type="submit"]')
      await page.waitForTimeout(700)
      checker.check('忘记密码发送请求并提示', calls.includes('reset_send') && await page.locator('#sent').isVisible())

      await page.goto(`${base}/me/reset?email=user%40example.com&token=TOK`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(400)
      checker.check('重置页不自动消耗 token', !calls.some((c) => c.startsWith('reset:')))
      await page.click('#reset-confirm')
      await page.waitForTimeout(700)
      checker.check('重置页显示新密码', (await page.locator('#password').innerText()).trim() === 'Ab3dE5fG7hJ9', await page.locator('#password').innerText())
      await context.close()
    }

    // 9. 价格页 / 公告 / 密钥编辑
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      await page.route('**/api/pricing', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [{ model_name: 'm1', model_ratio: 0.15, completion_ratio: 4, model_price: 0 }] }),
      }))
      await page.route('**/api/status', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { quota_per_unit: 500000, announcements_enabled: true, announcements: [{ publishDate: '2026-11-03T00:00:00Z', content: 'notice' }] } }),
      }))
      await page.goto(`${base}/me/pricing`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(700)
      checker.check('价格页渲染模型与价格', (await page.locator('#rows').innerText()).includes('$0.30'), (await page.locator('#rows').innerText()).replace(/\n/g, ' | '))

      await page.goto(`${base}/me/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(700)
      checker.check('公告横幅可见', await page.locator('#announcements').isVisible())
      await page.click('#ann-dismiss')
      await page.waitForTimeout(300)
      checker.check('公告可关闭', await page.locator('#announcements').isHidden())

      await page.route('**/api/token/**', async (route) => {
        const method = route.request().method()
        if (method === 'PUT') {
          calls.push('token-put:' + String(route.request().postData() ?? ''))
          return route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [{ id: 11, name: 'old', key: 'sk-abcdefghijklmnopqrstuvwxyz', status: 1, remain_quota: 0, unlimited_quota: true, expired_time: -1, allow_ips: '', used_quota: 0 }] } }) })
      })
      await page.goto(`${base}/me/keys`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(600)
      await page.click('[data-edit]')
      await page.waitForTimeout(300)
      checker.check('编辑对话框预填名称', (await page.inputValue('#edit-form input[name="name"]')) === 'old')
      await page.fill('#edit-form input[name="name"]', 'renamed')
      await page.click('#edit-form button[type="submit"]')
      await page.waitForTimeout(700)
      checker.check('编辑提交 PUT 且带新名称', calls.some((c) => c.includes('token-put:') && c.includes('"name":"renamed"')), calls.join(' | '))
      await context.close()
    }

    // 10. 两步验证：启用流程与登录动态码步骤
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      let enabled = false
      await page.route('**/api/user/2fa/status', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled } }) }))
      await page.route('**/api/user/2fa/setup', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { secret: 'JBSWY3DPEHPK3PXP', qr_code_data: 'otpauth://x', backup_codes: ['A1B2-C3D4', 'E5F6-G7H8'] } }),
      }))
      await page.route('**/api/user/2fa/enable', async (route) => {
        calls.push('2fa-enable:' + String(route.request().postData() ?? ''))
        enabled = true
        await route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
      })
      await page.goto(`${base}/me/account`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(500)
      checker.check('账号页默认未启用 2FA', await page.locator('#twofa-off').isVisible())
      await page.click('#twofa-start')
      await page.waitForSelector('#twofa-setup:not([hidden])', { timeout: 10000 })
      checker.check('2FA 设置显示密钥', (await page.locator('#twofa-secret').innerText()).trim() === 'JBSWY3DPEHPK3PXP')
      checker.check('2FA 设置显示备份码', (await page.locator('#twofa-backup code').count()) === 2)
      await page.fill('#twofa-code', '123456')
      await page.click('#twofa-confirm')
      await page.waitForTimeout(400)
      checker.check('未确认已保存时拦截启用', !calls.some((c) => c.startsWith('2fa-enable:')))
      await page.check('#twofa-saved')
      await page.click('#twofa-confirm')
      await page.waitForTimeout(800)
      checker.check('启用请求正确', calls.some((c) => c === '2fa-enable:{"code":"123456"}'), calls.join(' | '))
      checker.check('启用后显示已启用', await page.locator('#twofa-on').isVisible())

      await page.route('**/api/user/login', (route) => route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":{"require_2fa":true,"twofa_token":"NONCE1"}}' }))
      await page.route('**/api/user/login/2fa', async (route) => {
        calls.push('login-2fa:' + String(route.request().postData() ?? ''))
        await route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":{"id":7,"username":"u"}}' })
      })
      await page.context().clearCookies()
      await page.evaluate(() => localStorage.clear())
      await page.goto(`${base}/me/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[name="username"]', 'u')
      await page.fill('input[name="password"]', 'Password123')
      await page.click('#auth-form button[type="submit"]')
      await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 10000 })
      checker.check('密码后进入动态码步骤', await page.locator('#twofa-login-code').isVisible())
      await page.fill('#twofa-login-code', '654321')
      await page.click('#twofa-form button[type="submit"]')
      await page.waitForTimeout(1200)
      checker.check('动态码与 nonce 正确提交', calls.some((c) => c === 'login-2fa:{"code":"654321","token":"NONCE1"}'), calls.join(' | '))
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      checker.check('2FA 登录后进入控制台', await page.locator('#app').isVisible(), page.url())
      await context.close()
    }

    // 12. 用量统计与旧密钥清理
    {
      const { page, context, calls } = await withPage(browser, { locale: brand.locale, status: STATUS_OFF, signedIn: true })
      const DAY = 86400
      const now = Math.floor(Date.now() / 1000)
      const day1 = Math.floor((now - DAY) / DAY) * DAY
      await page.route('**/api/data/self**', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [
          { model_name: 'm-flash', created_at: day1, count: 10, token_used: 1200, quota: 12000 },
          { model_name: 'm-pro', created_at: day1, count: 2, token_used: 800, quota: 8000 },
        ] }),
      }))
      await page.goto(`${base}/me/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(800)
      checker.check('统计按天聚合', (await page.locator('#stats-days tr').count()) === 1)
      const models = await page.locator('#stats-models').innerText()
      checker.check('统计按模型聚合', models.includes('m-flash') && models.includes('m-pro'), models.replace(/\n/g, ' | '))

      let tokens = [{ id: 21, name: 'old-key', key: 'sk-oldkey', status: 1, remain_quota: 0, unlimited_quota: true, created_time: now - 40 * DAY, accessed_time: 0, used_quota: 0 }]
      await page.route('**/api/token/**', async (route) => {
        if (route.request().method() === 'DELETE') {
          calls.push('token-delete:' + route.request().url().split('/').pop())
          tokens = []
          return route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: tokens } }) })
      })
      page.on('dialog', (dialog) => dialog.accept())
      await page.goto(`${base}/me/keys`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
      await page.waitForTimeout(700)
      checker.check('旧密钥面板显示', await page.locator('#stale').isVisible())
      await page.click('#stale-clean')
      await page.waitForTimeout(1000)
      checker.check('旧密钥清理调用 DELETE', calls.some((c) => c === 'token-delete:21'), calls.join(' | '))
      await context.close()
    }

    // 14. CSP 前置条件：页面不得有内联脚本，且由 data-page 启动
    for (const name of ['index', 'keys', 'login', 'register', 'account', 'topup', 'pricing', 'dsh', 'forgot', 'reset']) {
      const html = await (await fetch(`${base}/me/${name}.html`)).text()
      const inline = /<script>(?![\s\S]*?src=)/.test(html)
      const hasBoot = html.includes('src="/me/boot.js"') && /data-page="[a-z]+"/.test(html)
      checker.check(`${name}.html 无内联脚本且用 boot.js`, !inline && hasBoot)
      checker.check(`${name}.html 不指向 www`, !/https:\/\/www\./.test(html))
      if (['index', 'keys', 'topup', 'pricing'].includes(name)) {
        checker.check(`${name}.html 有账号入口`, html.includes('href="/me/account"'), name)
      }
    }

    // 15. 桌面登录：已登录直接完成 / 2FA 提示
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
