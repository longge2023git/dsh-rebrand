/** DSH account/inference protocol served over Node's HTTP primitives. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { RelayConfig } from './config.ts'
import { modelListing, upstreamModel } from './models.ts'
import { authorizedPage, authorizePage, errorPage, simplePage } from './pages.ts'
import {
  accountToken, cookie, hashPassword, hmac, HttpError, parseCookies, randomToken,
  readBody, readJson, safeEqual, sendHtml, sendJson, sha256, verifyPassword, verifyPkce,
} from './security.ts'
import { Store, type AuthTx, type User } from './store.ts'

const TX_TTL_MS = 300_000
const CODE_TTL_MS = 120_000
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Running relay handle. */
export interface Relay {
  readonly server: Server
  readonly store: Store
  readonly port: number
  close(): Promise<void>
}

function envelope(bizData: unknown): unknown {
  return { code: 0, data: { biz_code: 0, biz_data: bizData } }
}

function jsonError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: { type: status === 401 ? 'authentication_error' : 'invalid_request_error', message } })
}

/** Validate the loopback callback DSH supplied. */
function callbackOrigin(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'redirect_uri is required')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HttpError(400, 'redirect_uri is invalid')
  }
  const explicitPort = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):([0-9]+)\/oauth\/callback$/iu.exec(value)?.[1]
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) || explicitPort === undefined
    || Number(explicitPort) === 0 || url.pathname !== '/oauth/callback' || url.search !== '' || url.hash !== ''
    || url.username !== '' || url.password !== '') {
    throw new HttpError(400, 'redirect_uri must be a loopback http origin with /oauth/callback and an explicit port')
  }
  return `${url.protocol}//${url.hostname}:${Number(explicitPort)}/oauth/callback`
}

function requireString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, `${subject} is required`)
  return value
}

function profile(user: User): unknown {
  return {
    id: user.id,
    email: user.email,
    mobile: '',
    id_profile: { name: null, picture: null },
  }
}

function txCsrf(secret: string, txId: string): string {
  return hmac(secret, `csrf:${txId}`)
}

function parseEmail(value: unknown): string {
  const email = requireString(value, 'email').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) throw new HttpError(400, '邮箱格式不正确')
  return email
}

/**
 * Forward an SSE stream while dropping duplicate `message_start` events.
 * New API's OpenAI-to-Anthropic conversion can emit one per upstream chunk;
 * DSH rejects a second `message_start` as malformed.
 */
async function pumpSse(body: ReadableStream<Uint8Array>, res: ServerResponse): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  const forward = (block: string): void => {
    const dataLine = block.split('\n').find(line => line.startsWith('data:'))
    if (dataLine === undefined) {
      res.write(`${block}\n\n`)
      return
    }
    let type: unknown
    try {
      type = (JSON.parse(dataLine.slice(5).trim()) as { type?: unknown }).type
    } catch {
      res.write(`${block}\n\n`)
      return
    }
    if (type === 'message_start') {
      if (started) return
      started = true
    }
    res.write(`${block}\n\n`)
  }
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (block.trim() !== '') forward(block)
      boundary = buffer.indexOf('\n\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.trim() !== '') forward(buffer)
  res.end()
}

/** Create one relay instance. */
export function createRelay(config: RelayConfig): Relay {
  const store = new Store(config.dataDir)
  const secure = new URL(config.publicOrigin).protocol === 'https:'
  const attempts = new Map<string, { count: number; resetAt: number }>()

  const liveUser = (req: IncomingMessage): { user: User; hash: string } | undefined => {
    const token = accountToken(req)
    if (token === undefined) return undefined
    const hash = sha256(token)
    const user = store.tokenUser(hash, Date.now())
    return user === undefined ? undefined : { user, hash }
  }

  const sessionUser = (req: IncomingMessage): { user: User; hash: string } | undefined => {
    const value = parseCookies(req.headers.cookie).get('relay_session')
    if (value === undefined) return undefined
    const separator = value.lastIndexOf('.')
    if (separator < 1) return undefined
    const sid = value.slice(0, separator)
    const signature = value.slice(separator + 1)
    if (!safeEqual(hmac(config.sessionSecret, sid), signature)) return undefined
    const hash = sha256(sid)
    const user = store.sessionUser(hash, Date.now())
    return user === undefined ? undefined : { user, hash }
  }

  const redirectWithCode = (res: ServerResponse, tx: AuthTx, user: User): void => {
    const code = randomToken(24)
    store.setTxCode(tx.id, user.id, sha256(code), Date.now() + CODE_TTL_MS)
    const target = new URL(tx.redirectUri)
    target.searchParams.set('code', code)
    target.searchParams.set('state', tx.state)
    res.writeHead(302, { location: target.href, 'cache-control': 'no-store' }).end()
  }

  const issueSession = (res: ServerResponse, user: User): void => {
    const sid = randomToken(24)
    store.createSession(sha256(sid), user.id, Date.now() + SESSION_TTL_MS)
    res.setHeader('set-cookie', cookie('relay_session', `${sid}.${hmac(config.sessionSecret, sid)}`, {
      maxAgeSeconds: SESSION_TTL_MS / 1000, secure,
    }))
  }

  const allowed = (req: IncomingMessage): boolean => {
    const key = req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const entry = attempts.get(key)
    if (entry === undefined || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + 300_000 })
      return true
    }
    entry.count += 1
    return entry.count <= 10
  }

  const loadTx = (id: string): AuthTx => {
    const tx = store.txById(id)
    if (tx === undefined || tx.cancelledAt !== null || tx.usedAt !== null || tx.expiresAt <= Date.now()) {
      throw new HttpError(400, '登录事务不存在或已过期')
    }
    return tx
  }

  async function handleAuthInit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req)
    const challenge = requireString(body.code_challenge, 'code_challenge')
    const state = requireString(body.state, 'state')
    if (body.code_challenge_method !== 'S256') throw new HttpError(400, 'code_challenge_method must be S256')
    if (!/^[A-Za-z0-9_-]{43}$/u.test(challenge)) throw new HttpError(400, 'code_challenge must be 43 base64url characters')
    const redirectUri = callbackOrigin(body.redirect_uri)
    const id = randomToken(16)
    const now = Date.now()
    store.createTx({ id, challenge, state, redirectUri, createdAt: now, expiresAt: now + TX_TTL_MS })
    sendJson(res, 200, envelope({
      authorize_url: `${config.publicOrigin}/dsh/authorize?tx=${encodeURIComponent(id)}`,
      authorize_id: id,
      expires_in: TX_TTL_MS / 1000,
    }))
  }

  async function handleExchange(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req)
    const code = requireString(body.code, 'code')
    const verifier = requireString(body.code_verifier, 'code_verifier')
    const redirectUri = callbackOrigin(body.redirect_uri)
    const tx = store.txByCodeHash(sha256(code))
    if (tx === undefined || tx.usedAt !== null || tx.cancelledAt !== null
      || tx.codeExpiresAt === null || tx.codeExpiresAt <= Date.now()
      || tx.userId === null || tx.redirectUri !== redirectUri || !verifyPkce(verifier, tx.challenge)) {
      throw new HttpError(400, 'authorization code is invalid or expired')
    }
    store.consumeTx(tx.id, Date.now())
    const user = store.userById(tx.userId)
    if (user === undefined) throw new HttpError(400, 'account no longer exists')
    const token = randomToken(32)
    store.createToken(sha256(token), user.id, Date.now() + config.tokenTtlDays * 86_400_000)
    sendJson(res, 200, envelope({
      token,
      authorized_url: `${config.publicOrigin}/dsh/authorized`,
      user: profile(user),
    }))
  }

  async function handleCancel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req)
    const id = body.authorize_id
    if (typeof id === 'string') store.cancelTx(id, Date.now())
    sendJson(res, 200, envelope(null))
  }

  function handleCurrent(req: IncomingMessage, res: ServerResponse): void {
    const live = liveUser(req)
    if (live === undefined) return jsonError(res, 401, 'account token is missing or expired')
    sendJson(res, 200, envelope(profile(live.user)))
  }

  function handleSummary(req: IncomingMessage, res: ServerResponse): void {
    if (liveUser(req) === undefined) return jsonError(res, 401, 'account token is missing or expired')
    sendJson(res, 200, envelope({ normal_wallets: [], bonus_wallets: [] }))
  }

  function handleBonuses(req: IncomingMessage, res: ServerResponse): void {
    if (liveUser(req) === undefined) return jsonError(res, 401, 'account token is missing or expired')
    sendJson(res, 200, envelope([]))
  }

  async function handleAck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (liveUser(req) === undefined) return jsonError(res, 401, 'account token is missing or expired')
    await readJson(req)
    sendJson(res, 200, envelope(null))
  }

  function handleLogout(req: IncomingMessage, res: ServerResponse): void {
    const live = liveUser(req)
    if (live === undefined) return jsonError(res, 401, 'account token is missing or expired')
    store.revokeToken(live.hash, Date.now())
    sendJson(res, 200, envelope(null))
  }

  function handleModels(req: IncomingMessage, res: ServerResponse): void {
    if (liveUser(req) === undefined) return jsonError(res, 401, 'account token is missing or expired')
    sendJson(res, 200, modelListing(config.models))
  }

  async function handleMessages(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (liveUser(req) === undefined) return jsonError(res, 401, 'account token is missing or expired')
    if (config.newapiKey === undefined) {
      return jsonError(res, 503, 'NEWAPI_KEY is not configured; add a New API key to the relay environment')
    }
    const body = await readJson(req)
    const model = body.model
    if (typeof model !== 'string' || model.length === 0) throw new HttpError(400, 'model is required')
    body.model = upstreamModel(config.models, model)
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'text/event-stream',
      'anthropic-version': typeof req.headers['anthropic-version'] === 'string' ? req.headers['anthropic-version'] : '2023-06-01',
      authorization: `Bearer ${config.newapiKey}`,
    }
    const beta = req.headers['anthropic-beta']
    if (typeof beta === 'string') headers['anthropic-beta'] = beta
    const controller = new AbortController()
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    let upstream: Response
    try {
      upstream = await fetch(`${config.newapiBaseUrl}/v1/messages`, {
        method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: controller.signal,
      })
    } catch {
      return jsonError(res, 502, 'could not reach the New API upstream')
    }
    if (upstream.status === 401 || upstream.status === 403) {
      await upstream.body?.cancel()
      return jsonError(res, 502, 'New API rejected the configured upstream key')
    }
    const outgoing: Record<string, string> = { 'cache-control': 'no-store' }
    for (const name of ['content-type', 'request-id', 'x-request-id', 'retry-after']) {
      const value = upstream.headers.get(name)
      if (value !== null) outgoing[name] = value
    }
    res.writeHead(upstream.status, outgoing)
    if (upstream.body === null) {
      res.end()
      return
    }
    if ((outgoing['content-type'] ?? '').includes('text/event-stream')) {
      await pumpSse(upstream.body, res)
      return
    }
    Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res)
  }

  async function handleAuthorizePage(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const tx = loadTx(url.searchParams.get('tx') ?? '')
    const session = sessionUser(req)
    if (session !== undefined) return redirectWithCode(res, tx, session.user)
    const mode = url.searchParams.get('mode') === 'register' && config.allowRegistration ? 'register' : 'login'
    sendHtml(res, 200, authorizePage({
      brand: config.brandName, tx: tx.id, csrf: txCsrf(config.sessionSecret, tx.id), mode, email: '',
      allowRegistration: config.allowRegistration,
    }))
  }

  async function handleAuthorizePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowed(req)) return sendHtml(res, 429, errorPage(config.brandName, '尝试过于频繁，请稍后再试'))
    const form = new URLSearchParams((await readBody(req)).toString('utf8'))
    const tx = loadTx(form.get('tx') ?? '')
    const csrf = form.get('csrf') ?? ''
    if (!safeEqual(csrf, txCsrf(config.sessionSecret, tx.id))) {
      return sendHtml(res, 400, errorPage(config.brandName, '表单已过期，请重新打开登录页'))
    }
    const mode = form.get('mode') === 'register' ? 'register' : 'login'
    const email = parseEmail(form.get('email'))
    const password = form.get('password') ?? ''
    if (password.length < 8) {
      return sendHtml(res, 400, authorizePage({
        brand: config.brandName, tx: tx.id, csrf: txCsrf(config.sessionSecret, tx.id), mode, email,
        message: '密码至少 8 位', allowRegistration: config.allowRegistration,
      }))
    }
    let user = store.userByEmail(email)
    if (mode === 'register') {
      if (!config.allowRegistration) return sendHtml(res, 403, errorPage(config.brandName, '注册未开放'))
      if (user !== undefined) {
        return sendHtml(res, 409, authorizePage({
          brand: config.brandName, tx: tx.id, csrf: txCsrf(config.sessionSecret, tx.id), mode, email,
          message: '该邮箱已注册，请直接登录', allowRegistration: config.allowRegistration,
        }))
      }
      try {
        user = store.createUser(randomToken(16), email, hashPassword(password), Date.now())
      } catch {
        return sendHtml(res, 409, errorPage(config.brandName, '该邮箱已注册'))
      }
    } else if (user === undefined || !verifyPassword(password, user.passwordHash)) {
      return sendHtml(res, 401, authorizePage({
        brand: config.brandName, tx: tx.id, csrf: txCsrf(config.sessionSecret, tx.id), mode, email,
        message: '邮箱或密码错误', allowRegistration: config.allowRegistration,
      }))
    }
    issueSession(res, user)
    redirectWithCode(res, tx, user)
  }

  function pageFor(req: IncomingMessage, res: ServerResponse, kind: 'usage' | 'top_up'): void {
    const session = sessionUser(req)
    if (kind === 'usage') {
      sendHtml(res, 200, simplePage({
        brand: config.brandName, title: '用量', email: session?.user.email,
        body: '本地参考中转站不记录用量；接入生产计费后在此展示。',
      }))
      return
    }
    sendHtml(res, 200, simplePage({
      brand: config.brandName, title: '充值', email: session?.user.email,
      body: '本地参考中转站不提供充值；接入生产支付后在此展示。',
    }))
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', config.publicOrigin)
    const method = req.method ?? 'GET'
    if (method === 'GET' && url.pathname === '/healthz') return sendJson(res, 200, { ok: true })
    if (method === 'POST' && url.pathname === '/auth-api/v0/dsh/auth_init') return handleAuthInit(req, res)
    if (method === 'POST' && url.pathname === '/auth-api/v0/dsh/auth_exchange') return handleExchange(req, res)
    if (method === 'POST' && url.pathname === '/auth-api/v0/dsh/auth_cancel') return handleCancel(req, res)
    if (method === 'GET' && url.pathname === '/auth-api/v0/users/current') return handleCurrent(req, res)
    if (method === 'GET' && url.pathname === '/api/v0/users/get_user_summary') return handleSummary(req, res)
    if (method === 'GET' && url.pathname === '/api/v0/users/get_unnotified_bonuses') return handleBonuses(req, res)
    if (method === 'POST' && url.pathname === '/api/v0/users/ack_bonus_notified') return handleAck(req, res)
    if (method === 'POST' && url.pathname === '/auth-api/v0/users/logout') return handleLogout(req, res)
    if (method === 'GET' && url.pathname === '/models') return handleModels(req, res)
    if (method === 'POST' && url.pathname === '/v1/messages') return handleMessages(req, res)
    if (method === 'POST' && url.pathname.startsWith('/v1/files')) {
      return sendJson(res, 404, { error: { type: 'not_found_error', message: 'files are not supported by this relay' } })
    }
    if (method === 'GET' && url.pathname === '/dsh/authorize') return handleAuthorizePage(req, res, url)
    if (method === 'POST' && url.pathname === '/dsh/authorize') return handleAuthorizePost(req, res)
    if (method === 'GET' && url.pathname === '/dsh/authorized') return sendHtml(res, 200, authorizedPage(config.brandName))
    if (method === 'GET' && url.pathname === '/usage') return pageFor(req, res, 'usage')
    if (method === 'GET' && url.pathname === '/top_up') return pageFor(req, res, 'top_up')
    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(302, { location: '/dsh/authorized', 'cache-control': 'no-store' }).end()
      return
    }
    jsonError(res, 404, 'not found')
  }

  const server = createServer((req, res) => {
    void route(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof HttpError ? error.message : 'internal relay error'
      if (status === 500) console.error('[relay]', error instanceof Error ? error.message : error)
      if (res.headersSent) {
        res.destroy()
        return
      }
      jsonError(res, status, message)
    })
  })

  return {
    server,
    store,
    port: config.port,
    close: () => new Promise<void>((resolvePromise, reject) => {
      server.close((error) => {
        store.close()
        if (error) reject(error)
        else resolvePromise()
      })
    }),
  }
}

/** Start the relay from environment configuration. */
export async function startFromEnv(): Promise<Relay> {
  const { loadConfig } = await import('./config.ts')
  const config = loadConfig()
  const relay = createRelay(config)
  await new Promise<void>((resolvePromise) => { relay.server.listen(config.port, '127.0.0.1', resolvePromise) })
  console.log(`[relay] listening on ${config.publicOrigin} (New API: ${config.newapiBaseUrl})`)
  return relay
}
