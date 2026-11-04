/** Account security: password rotation and the recovery entry points. */
import { createUserViaDb, launchBrowser, login, uniq } from '../lib.mjs'

const OLD = 'E2eOldPass123'
const NEW = 'E2eNewPass456'

export async function runSecurity({ brand, checker, users }) {
  const user = uniq(brand.lang + 's')
  const browser = await launchBrowser()
  const context = await browser.newContext({ locale: brand.locale })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  try {
    createUserViaDb(brand.id, user, OLD)
    users.push(user)
    await login(page, brand.app, user, OLD)
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })

    // 0. 另一个浏览器先登录同一账号（用于验证改密后旧会话失效）
    const oldContext = await browser.newContext({ locale: brand.locale })
    const oldPage = await oldContext.newPage()
    oldPage.setDefaultTimeout(45000)
    await login(oldPage, brand.app, user, OLD)
    await oldPage.waitForSelector('#app:not([hidden])', { timeout: 20000 })

    // 1. 改密码
    await page.goto(`${brand.app}/me/account`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
    await page.fill('input[name="current"]', OLD)
    await page.fill('input[name="password"]', NEW)
    await page.fill('input[name="confirm"]', NEW)
    await page.click('#password-form button[type="submit"]')
    await page.waitForTimeout(2000)
    checker.check('修改密码成功', await page.locator('#saved').isVisible())

    const oldSessionStatus = await oldPage.evaluate(async () => {
      const uid = JSON.parse(localStorage.getItem('user') || '{}').id
      const response = await fetch('/api/user/self', { headers: { 'New-Api-User': String(uid) } })
      return response.status
    })
    checker.check('改密后旧会话失效', oldSessionStatus === 401, `old session self=${oldSessionStatus}`)
    const ownSessionStatus = await page.evaluate(async () => {
      const uid = JSON.parse(localStorage.getItem('user') || '{}').id
      const response = await fetch('/api/user/self', { headers: { 'New-Api-User': String(uid) } })
      return response.status
    })
    checker.check('改密设备自身会话保留', ownSessionStatus === 200, `self=${ownSessionStatus}`)
    await oldContext.close()

    // 2. 旧密码不能再登录
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${brand.app}/me/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', OLD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForTimeout(2000)
    checker.check('旧密码登录被拒', page.url().includes('/me/login') && (await page.locator('#error').innerText()).trim().length > 0)

    // 3. 新密码可以登录
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', NEW)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForTimeout(2500)
    checker.check('新密码登录成功', !page.url().includes('/me/login'), page.url())

    // 4. 忘记密码入口有反馈（SMTP 未配置时应给出明确提示而不是崩溃）
    await page.goto(`${brand.app}/me/forgot`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="email"]', 'nobody@example.com')
    await page.click('#forgot-form button[type="submit"]')
    await page.waitForTimeout(2500)
    const feedback = await page.evaluate(() => {
      const error = document.getElementById('error')
      const sent = document.getElementById('sent')
      return { error: error && !error.hidden ? error.textContent.trim() : '', sent: sent && !sent.hidden }
    })
    checker.check('忘记密码有明确反馈', Boolean(feedback.error) || feedback.sent, JSON.stringify(feedback))
  } finally {
    await browser.close()
  }
}
