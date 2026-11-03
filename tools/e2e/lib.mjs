/**
 * Shared helpers for the mini-site E2E suites.
 *
 * Two modes:
 *  - local: serve console/dist and intercept /api/* in the browser (no data, no production impact)
 *  - live:  real gateway; creates temp users and (optionally) deletes them over SSH
 */
import { chromium } from './playwright.mjs'
import { execFileSync } from 'node:child_process'

export const BRANDS = {
  fa: { site: 'https://www.deepseekfa.com', app: 'https://deepseekfa.com', lang: 'fa', dir: 'rtl', product: 'DeepSeek-FA', locale: 'fa-IR', sshEnv: 'E2E_SSH_FA' },
  ru: { site: 'https://www.deepseek-ru.org', app: 'https://deepseek-ru.org', lang: 'ru', dir: 'ltr', product: 'DeepSeek-RU', locale: 'ru-RU', sshEnv: 'E2E_SSH_RU' },
}

/**
 * Egress for both the browser and curl. They must match: the gateway rate-limits
 * 20 critical requests per 20 minutes per IP, so a shared proxy also shares that
 * budget with the machine's own traffic. Set E2E_PROXY=direct for a dedicated IP.
 */
export const PROXY = (process.env.E2E_PROXY ?? 'socks5://127.0.0.1:10808') === 'direct' ? '' : (process.env.E2E_PROXY ?? 'socks5://127.0.0.1:10808')

/** Collects check results and prints them as they happen. */
export class Checker {
  constructor(tag) {
    this.tag = tag
    this.results = []
  }

  check(name, ok, detail = '') {
    this.results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${this.tag}] ${name}${detail ? '  — ' + detail : ''}`)
    return ok
  }

  get failed() {
    return this.results.filter((r) => !r.ok)
  }

  summary() {
    const failed = this.failed
    console.log(`\n=== ${this.tag}: ${this.results.length - failed.length}/${this.results.length} 通过`)
    for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`)
    return failed.length === 0
  }
}

/** Launch Chrome with the shared egress proxy so rate limits see one client. */
export function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.E2E_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: PROXY ? [`--proxy-server=${PROXY}`] : [],
  })
}

/** JSON API call through the proxy (browser-independent). */
export function apiJson(base, path, body) {
  const args = ['-sS', '--max-time', '30', ...(PROXY ? ['-x', PROXY] : []), '-X', 'POST', base + path,
    '-H', 'Content-Type: application/json', '-d', JSON.stringify(body ?? {})]
  return JSON.parse(execFileSync('curl', args, { encoding: 'utf8' }) || '{}')
}

/** Register through the API with the same 429 backoff as the UI path. */
export async function registerViaApi(base, username, password) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = apiJson(base, '/api/user/register', { username, password })
    if (result?.success === true) return result
    if (attempt < 3) {
      console.log('[e2e] 注册接口被限流或失败，5 分钟后重试（第 ' + attempt + ' 次）')
      await new Promise((resolve) => setTimeout(resolve, 300000))
    }
  }
  return { success: false, message: '注册失败（重试后仍不成功）' }
}

/** Delete temp users through the operator's SSH command (env E2E_SSH_FA / E2E_SSH_RU). */
export function cleanupUsers(brand, usernames, dbPath) {
  if (usernames.length === 0) return
  const ssh = process.env[BRANDS[brand].sshEnv]
  if (!ssh) {
    console.log(`\n[cleanup] 未设置 ${BRANDS[brand].sshEnv}，请手动删除这些测试账号：${usernames.join(', ')}`)
    return
  }
  const names = '[' + usernames.map((user) => JSON.stringify(user)).join(', ') + ']'
  const script = [
    'import sqlite3',
    `names = ${names}`,
    `c = sqlite3.connect(${JSON.stringify(dbPath)})`,
    "ids = [row[0] for row in c.execute('select id, username from users') if row[1] in names]",
    'for uid in ids:',
    "    for table in ('tokens', 'logs'): c.execute(f'delete from {table} where user_id=?', (uid,))",
    "    c.execute('delete from users where id=?', (uid,))",
    'c.commit()',
    "print('[cleanup] deleted', len(ids), 'users')",
  ].join('\n')
  try {
    const out = execFileSync('bash', ['-c', `${ssh} python3 -`], { input: script, encoding: 'utf8' })
    console.log(out.trim())
  } catch (error) {
    console.log(`[cleanup] 失败：${error.message}\n  请手动删除：${usernames.join(', ')}`)
  }
}

/** Track the latest status of the API calls one page action makes. */
function watchStatus(page, fragments) {
  const state = { status: 0 }
  const handler = (response) => {
    if (fragments.some((fragment) => response.url().includes(fragment))) state.status = response.status()
  }
  page.on('response', handler)
  return { get status() { return state.status }, stop: () => page.off('response', handler) }
}

/** Wait for a form-driven navigation, retrying once a minute while the gateway rate-limits. */
async function submitAndWait(page, matcher, label, tracker) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.waitForURL(matcher, { timeout: 30000 })
      return
    } catch {
      if (tracker.status === 429 && attempt < 3) {
        // The gateway allows 20 critical requests per 20 minutes per IP, so a short
        // retry cannot succeed; wait long enough for the window to slide.
        console.log(`[e2e] ${label} 被限流，5 分钟后重试（第 ${attempt} 次）`)
        await page.waitForTimeout(300000)
        continue
      }
      const message = await page.locator('#error').innerText().catch(() => '')
      throw new Error(`${label}未跳转（${message || '无页面错误'}${tracker.status ? '，HTTP ' + tracker.status : ''}）`)
    }
  }
}

/** Fill the register form and wait for the post-registration page. */
export async function register(page, base, user, password, inviteCode = '') {
  const suffix = inviteCode ? `?aff=${encodeURIComponent(inviteCode)}` : ''
  await page.goto(`${base}/me/register${suffix}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  const tracker = watchStatus(page, ['/api/user/register', '/api/user/login'])
  try {
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', password)
    await page.fill('input[name="confirm"]', password)
    await page.click('#auth-form button[type="submit"]')
    await submitAndWait(page, /(\/me\/keys|\/me\/dsh)/, '注册', tracker)
  } finally {
    tracker.stop()
  }
}

/** Log in from the mini console login page. */
export async function login(page, base, user, password) {
  await page.goto(`${base}/me/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  const tracker = watchStatus(page, ['/api/user/login'])
  try {
    await page.fill('input[name="username"]', user)
    await page.fill('input[name="password"]', password)
    await page.click('#auth-form button[type="submit"]')
    await submitAndWait(page, /\/me\/(keys|dsh|)$/, '登录', tracker)
  } finally {
    tracker.stop()
  }
}

/** Read the numbers shown on the usage page. */
export async function readUsage(page, base) {
  await page.goto(`${base}/me/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 })
  await page.waitForTimeout(600)
  return page.evaluate(() => ({
    balance: document.getElementById('balance').textContent.trim(),
    invited: document.getElementById('aff-count').textContent.trim(),
    credit: document.getElementById('aff-quota').textContent.trim(),
    code: document.getElementById('aff-code').textContent.trim(),
    transfer: !document.getElementById('aff-transfer').hidden,
    signOut: !document.getElementById('sign-out').hidden,
  }))
}

export const uniq = (prefix) => prefix + Date.now().toString(36)
