/** 2FA: enable, TOTP login, backup codes, regeneration, disable, and desktop sign-in. */
import { createHash, randomBytes } from 'node:crypto'
import { apiJson, createUserViaDb, launchBrowser, login, totpCode, uniq } from '../lib.mjs'

const PASSWORD = 'E2eTwoFa123'

/** The gateway accepts the current 30s window plus one step of skew. */
function codeFor(secret) {
  return totpCode(secret)
}

/** Assert the console really loaded, not just a URL. */
async function assertSignedIn(page, brand, checker, label) {
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
  const self = await page.evaluate(async () => {
    const uid = JSON.parse(localStorage.getItem('user') || '{}').id
    const response = await fetch('/api/user/self', { headers: { 'New-Api-User': String(uid) } })
    return response.status
  })
  checker.check(label, self === 200, `self=${self}`)
}

/** Read the 2FA status through the authenticated API. */
async function twoFactorStatus(page) {
  return page.evaluate(async () => {
    const uid = JSON.parse(localStorage.getItem('user') || '{}').id
    const response = await fetch('/api/user/2fa/status', { headers: { 'New-Api-User': String(uid) } })
    const payload = await response.json().catch(() => ({}))
    return payload?.data?.enabled
  })
}

export async function runTwofa({ brand, checker, users }) {
  // RFC 6238 vector: a wrong TOTP implementation would make every later check pass by luck.
  const vector = totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000)
  checker.check('TOTP 实现符合 RFC 6238', vector === '287082', vector)

  const user = uniq(brand.lang + 't')
  createUserViaDb(brand.id, user, PASSWORD)
  users.push(user)

  const browser = await launchBrowser()
  try {
    let context = await browser.newContext({ locale: brand.locale })
    let page = await context.newPage()
    page.setDefaultTimeout(45000)
    await login(page, brand.app, user, PASSWORD)
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })

    // 1. 启用
    await page.goto(`${brand.app}/me/account`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#twofa-off', { timeout: 20000 })
    const statusBefore = await twoFactorStatus(page)
    checker.check('初始未启用 2FA', statusBefore === false, String(statusBefore))
    await page.click('#twofa-start')
    await page.waitForSelector('#twofa-setup:not([hidden])', { timeout: 20000 })
    const secret = (await page.locator('#twofa-secret').innerText()).trim()
    checker.check('返回 TOTP 密钥', /^[A-Z2-7]{16,}$/.test(secret), secret.slice(0, 6) + '…')
    const backupCodes = await page.$$eval('#twofa-backup code', (nodes) => nodes.map((n) => n.textContent.trim()))
    checker.check('返回 4 个备份码', backupCodes.length === 4, String(backupCodes.length))
    await page.check('#twofa-saved')
    await page.fill('#twofa-code', codeFor(secret))
    await page.click('#twofa-confirm')
    await page.waitForSelector('#twofa-on:not([hidden])', { timeout: 20000 })
    const statusAfter = await twoFactorStatus(page)
    checker.check('2FA 已启用', statusAfter === true, String(statusAfter))
    checker.check('启用后密钥从页面清除', (await page.locator('#twofa-secret').innerText()).trim() === '')
    await context.close()

    // 2. 用 TOTP 登录
    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 20000 })
    checker.check('登录出现动态码步骤', await page.locator('#twofa-login-code').isVisible())
    await page.fill('#twofa-login-code', '000000')
    await page.click('#twofa-form button[type="submit"]')
    await page.waitForSelector('#twofa-login-error:not([hidden])', { timeout: 20000 })
    checker.check('错误动态码被拒', await page.locator('#twofa-login-error').isVisible())
    await page.fill('#twofa-login-code', codeFor(secret))
    await page.click('#twofa-form button[type="submit"]')
    await assertSignedIn(page, brand, checker, 'TOTP 登录成功')

    // 3. 重新生成备份码（面板不得再显示密钥/死控件）
    await page.goto(`${brand.app}/me/account`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#twofa-on:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-manage-code', codeFor(secret))
    await page.click('#twofa-regen')
    await page.waitForTimeout(1500)
    checker.check('重生成显示 4 个新码', (await page.locator('#twofa-backup code').count()) === 4)
    checker.check('重生成不显示密钥区块', await page.locator('#twofa-secret-block').isHidden())
    checker.check('重生成不显示确认按钮', await page.locator('#twofa-confirm').isHidden())
    const freshCodes = await page.$$eval('#twofa-backup code', (nodes) => nodes.map((n) => n.textContent.trim()))
    await context.close()

    // 4. 备份码登录，且同一码只能用一次
    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-login-code', freshCodes[0])
    await page.click('#twofa-form button[type="submit"]')
    await assertSignedIn(page, brand, checker, '备份码登录成功')
    await context.close()

    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-login-code', freshCodes[0])
    await page.click('#twofa-form button[type="submit"]')
    await page.waitForSelector('#twofa-login-error:not([hidden])', { timeout: 20000 })
    checker.check('备份码不能重复使用', page.url().includes('/me/login'))
    await context.close()

    // 5. 2FA 账号走完整桌面授权（此前直接 409）
    {
      const verifier = randomBytes(32).toString('base64url')
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      const redirectUri = 'http://127.0.0.1:51235/oauth/callback'
      const init = apiJson(brand.app, '/auth-api/v0/dsh/auth_init', {
        code_challenge: challenge, code_challenge_method: 'S256', state: 'e2e2fa', redirect_uri: redirectUri, locale: brand.lang,
      })
      const authorizeUrl = init?.data?.biz_data?.authorize_url ?? ''
      context = await browser.newContext({ locale: brand.locale })
      page = await context.newPage()
      page.setDefaultTimeout(45000)
      let completeBody = ''
      await page.addInitScript(() => {
        const original = window.fetch
        window.fetch = async (...call) => {
          const response = await original(...call)
          if (!String(call[0] ?? '').includes('/api/dsh/complete')) return response
          window.__completeBody = await response.clone().text()
          window.__completeStatus = response.status
          return new Promise(() => {})
        }
      })
      await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => !document.getElementById('auth-form')?.hidden, { timeout: 20000 })
      await page.fill('input[name="username"]', user)
      await page.fill('input[name="password"]', PASSWORD)
      await page.click('#auth-form button[type="submit"]')
      await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 20000 })
      await page.fill('#twofa-login-code', codeFor(secret))
      await page.click('#twofa-form button[type="submit"]')
      await page.waitForFunction(() => Boolean(window.__completeBody), null, { timeout: 25000 }).catch(() => {})
      completeBody = await page.evaluate(() => window.__completeBody || '').catch(() => '')
      const completeStatus = await page.evaluate(() => window.__completeStatus || 0).catch(() => 0)
      const redirect = JSON.parse(completeBody || '{}')?.data?.biz_data?.redirect ?? ''
      const code = redirect ? new URL(redirect).searchParams.get('code') : ''
      checker.check('2FA 账号完成桌面授权', Boolean(code), code ? 'code 已签发' : `HTTP ${completeStatus || '无响应'} ${completeBody.slice(0, 60)}`)
      const exchange = apiJson(brand.app, '/auth-api/v0/dsh/auth_exchange', { code, code_verifier: verifier, redirect_uri: redirectUri, device_model: 'darwin-arm64' })
      checker.check('2FA 账号 exchange 签发 token', Boolean(exchange?.data?.biz_data?.token))
      await context.close()
    }

    // 6. 关闭 2FA（需要动态码）
    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-login-code', codeFor(secret))
    await page.click('#twofa-form button[type="submit"]')
    await assertSignedIn(page, brand, checker, '再次登录成功')
    await page.goto(`${brand.app}/me/account`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#twofa-on:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-manage-code', codeFor(secret))
    await page.click('#twofa-disable')
    await page.waitForSelector('#twofa-off:not([hidden])', { timeout: 20000 })
    checker.check('2FA 已关闭', await page.locator('#twofa-off').isVisible())
    await context.close()

    // 7. 关闭后仅密码即可登录
    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await assertSignedIn(page, brand, checker, '关闭后仅密码登录成功')
    await context.close()
  } finally {
    await browser.close()
  }
}
