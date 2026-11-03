/** 2FA: enable with a real TOTP code, sign in with TOTP and with a backup code, then disable. */
import { createUserViaDb, launchBrowser, login, totpCode, uniq } from '../lib.mjs'

const PASSWORD = 'E2eTwoFa123'

/** The gateway accepts the current 30s window (plus one step of skew). */
function codeFor(secret) {
  return totpCode(secret)
}

export async function runTwofa({ brand, checker, users }) {
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
    checker.check('初始未启用 2FA', await page.locator('#twofa-off').isVisible())
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
    checker.check('2FA 已启用', await page.locator('#twofa-on').isVisible())
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
    checker.check('登录出现动态码步骤', true)
    const wrong = await page.inputValue('#twofa-login-code')
    await page.fill('#twofa-login-code', wrong === '000000' ? '111111' : '000000')
    await page.click('#twofa-form button[type="submit"]')
    await page.waitForTimeout(1500)
    checker.check('错误动态码被拒', page.url().includes('/me/login'))
    await page.fill('#twofa-login-code', codeFor(secret))
    await page.click('#twofa-form button[type="submit"]')
    await page.waitForTimeout(2500)
    checker.check('TOTP 登录成功', !page.url().includes('/me/login'), page.url())
    await context.close()

    // 3. 用备份码登录
    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForSelector('#twofa-form:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-login-code', backupCodes[0])
    await page.click('#twofa-form button[type="submit"]')
    await page.waitForTimeout(2500)
    checker.check('备份码登录成功', !page.url().includes('/me/login'), page.url())

    // 4. 关闭 2FA（需要新的动态码）
    await page.goto(`${brand.app}/me/account`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#twofa-on:not([hidden])', { timeout: 20000 })
    await page.fill('#twofa-manage-code', codeFor(secret))
    await page.click('#twofa-disable')
    await page.waitForSelector('#twofa-off:not([hidden])', { timeout: 20000 })
    checker.check('2FA 已关闭', await page.locator('#twofa-off').isVisible())
    await context.close()

    // 5. 关闭后仅密码即可登录
    context = await browser.newContext({ locale: brand.locale })
    page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForTimeout(2500)
    checker.check('关闭后仅密码登录成功', !page.url().includes('/me/login'), page.url())
    await context.close()
  } finally {
    await browser.close()
  }
}
