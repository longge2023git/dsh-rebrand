#!/usr/bin/env node
/**
 * End-to-end check of the desktop sign-in path for one gateway.
 *
 *   node tools/e2e-desktop-login.mjs --brand fa|ru --user <username> --pass <password>
 *
 * Both the browser and the API calls go through the same SOCKS5 proxy, so the
 * gateway's per-IP rate limit sees one client. Every step asserts; the exit code
 * is 1 on the first failure.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'

// playwright-core is not a repository dependency; point E2E_PLAYWRIGHT at a copy
// (for example /tmp/pw/node_modules/playwright-core/index.mjs) when running locally.
const { chromium } = await import(process.env.E2E_PLAYWRIGHT || 'playwright-core')

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]])
  return pairs
}, []))

const PROXY = process.env.E2E_PROXY || 'socks5://127.0.0.1:10808'
const BRANDS = {
  fa: { gateway: 'https://deepseekfa.com', lang: 'fa', label: 'DeepSeek-FA' },
  ru: { gateway: 'https://deepseek-ru.org', lang: 'ru', label: 'DeepSeek-RU' },
}
const brand = BRANDS[args.brand]
if (!brand) throw new Error('usage: --brand fa|ru --user <username> --pass <password>')
const user = args.user
const pass = args.pass

/** curl through the proxy so API calls share the browser's egress IP. */
const curl = (path, body, extra = []) => {
  const out = execFileSync('curl', [
    '-sS', '--max-time', '30', '-x', PROXY.replace(/^socks5:\/\//, 'http://').replace(/^socks5h:\/\//, 'http://'),
    '-X', 'POST', `${brand.gateway}${path}`, '-H', 'Content-Type: application/json',
    ...extra, '-d', JSON.stringify(body),
  ], { encoding: 'utf8' })
  return JSON.parse(out)
}

const failures = []
const step = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures.push(name)
}

const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const redirectUri = 'http://127.0.0.1:51234/oauth/callback'

const init = curl('/auth-api/v0/dsh/auth_init', {
  code_challenge: challenge, code_challenge_method: 'S256', state: 'e2e', redirect_uri: redirectUri, locale: brand.lang,
})
const authorizeUrl = init?.data?.biz_data?.authorize_url || ''
step('auth_init 返回迷你站地址', authorizeUrl.includes('/me/dsh?tx='), authorizeUrl.replace(/tx=[^&]+/, 'tx=…'))

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: [`--proxy-server=${PROXY}`],
})
const page = await (await browser.newContext({ locale: brand.lang === 'fa' ? 'fa-IR' : 'ru-RU' })).newPage()
const seen = []
page.on('response', (response) => {
  const path = new URL(response.url()).pathname
  if (path === '/api/user/login' || path === '/api/dsh/complete') seen.push(`${path} ${response.status()}`)
})
// The page navigates to dsh:// right after completing, which discards the DOM and
// makes the response body unreadable. Capture the real body in-page and hold the
// continuation: the test then reads the code without racing the navigation.
await page.addInitScript(() => {
  const original = window.fetch
  window.fetch = async (...call) => {
    const response = await original(...call)
    const target = String(call[0] ?? '')
    if (!target.includes('/api/dsh/complete')) return response
    window.__completeBody = await response.clone().text()
    return new Promise(() => {})
  }
})

await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !document.getElementById('auth-form')?.hidden, { timeout: 20000 })
step('迷你登录页显示表单', true, `lang=${await page.evaluate(() => document.documentElement.lang)}`)
step('页头品牌正确', (await page.locator('.brand').innerText()).trim() === brand.label,
  (await page.locator('.brand').innerText()).trim())

await page.fill('input[name="username"]', user)
await page.fill('input[name="password"]', pass)
await page.click('#auth-form button[type="submit"]')
await page.waitForTimeout(3000)

await page.waitForFunction(() => Boolean(window.__completeBody), null, { timeout: 20000 }).catch(() => {})
const completeBody = await page.evaluate(() => window.__completeBody || '').catch(() => '')
const redirect = JSON.parse(completeBody || '{}')?.data?.biz_data?.redirect || ''
const code = redirect ? new URL(redirect).searchParams.get('code') : ''
step('complete 返回回跳与 code', Boolean(code), redirect ? redirect.replace(code, 'code=…') : `(无) 网关响应: ${seen.join(', ') || '无'}`)

const exchange = curl('/auth-api/v0/dsh/auth_exchange', {
  code, code_verifier: verifier, redirect_uri: redirectUri, device_model: 'darwin-arm64',
})
const token = exchange?.data?.biz_data?.token || ''
step('exchange 签发 token', Boolean(token), token.slice(0, 10) + '…')

await browser.close()
console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过')
process.exitCode = failures.length ? 1 : 0
