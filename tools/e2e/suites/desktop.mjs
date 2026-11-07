/** Desktop sign-in chain: auth_init → mini page login → complete → exchange. */
import { createHash, randomBytes } from 'node:crypto'
import { apiJson, createUserViaDb, launchBrowser, uniq } from '../lib.mjs'

const PASSWORD = 'E2ePass12345'

export async function runDesktop({ brand, checker, users }) {
  const user = uniq(brand.lang + 'd')
  createUserViaDb(brand.id, user, PASSWORD)
  checker.check('准备账号', true, user)
  users.push(user)

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const redirectUri = 'http://127.0.0.1:51234/oauth/callback'
  const init = apiJson(brand.app, '/auth-api/v0/dsh/auth_init', {
    code_challenge: challenge, code_challenge_method: 'S256', state: 'e2e', redirect_uri: redirectUri, locale: brand.lang,
  })
  const authorizeUrl = init?.data?.biz_data?.authorize_url ?? ''
  checker.check('auth_init 返回客户端要求路径', new URL(authorizeUrl || 'https://x').pathname === '/dsh/authorize', authorizeUrl.replace(/tx=[^&]+/, 'tx=…'))

  const browser = await launchBrowser()
  const page = await (await browser.newContext({ locale: brand.locale })).newPage()
  let completeBody = ''
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (...call) => {
      const response = await original(...call)
      if (!String(call[0] ?? '').includes('/api/dsh/complete')) return response
      window.__completeBody = await response.clone().text()
      // Hold the continuation so the dsh:// navigation cannot discard the page.
      return new Promise(() => {})
    }
  })
  try {
    await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !document.getElementById('auth-form')?.hidden, { timeout: 20000 })
    checker.check('迷你登录页加载（语言/品牌）', (await page.evaluate(() => document.documentElement.lang)) === brand.lang
      && (await page.locator('.brand').innerText()).trim() === brand.product)
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('#auth-form button[type="submit"]')
    await page.waitForFunction(() => Boolean(window.__completeBody), null, { timeout: 20000 }).catch(() => {})
    completeBody = await page.evaluate(() => window.__completeBody || '').catch(() => '')
    const redirect = JSON.parse(completeBody || '{}')?.data?.biz_data?.redirect ?? ''
    const code = redirect ? new URL(redirect).searchParams.get('code') : ''
    checker.check('complete 返回 code', Boolean(code))
    const exchange = apiJson(brand.app, '/auth-api/v0/dsh/auth_exchange', { code, code_verifier: verifier, redirect_uri: redirectUri, device_model: 'darwin-arm64' })
    checker.check('exchange 签发 token', Boolean(exchange?.data?.biz_data?.token), (exchange?.data?.biz_data?.token ?? '').slice(0, 8) + '…')
  } finally {
    await browser.close()
  }
}
