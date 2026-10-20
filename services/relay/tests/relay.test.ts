/** End-to-end protocol test: register, exchange, list models, stream inference, logout. */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { RelayConfig } from '../src/config.ts'
import { createRelay, type Relay } from '../src/server.ts'

function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('no port'))
      const port = address.port
      server.close(() => resolvePromise(port))
    })
  })
}

interface FakeUpstream {
  readonly server: Server
  readonly url: string
  readonly seen: { authorization?: string; model?: string }
}

async function fakeUpstream(): Promise<FakeUpstream> {
  const seen: { authorization?: string; model?: string } = {}
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/messages') {
      res.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model?: string }
      seen.authorization = req.headers.authorization
      seen.model = body.model
      res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'req_test' })
      res.write('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":0}}}\n\n')
      // New API's conversion repeats message_start; the relay must keep only the first.
      res.write('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":0}}}\n\n')
      res.write('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n')
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n')
      res.write('event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n')
      res.write('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n')
      res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n')
      res.end()
    })
  })
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no upstream port')
  return { server, url: `http://127.0.0.1:${address.port}`, seen }
}

interface Bench {
  readonly relay: Relay
  readonly origin: string
  readonly dataDir: string
  readonly upstream: FakeUpstream
  close(): Promise<void>
}

async function bench(): Promise<Bench> {
  const dataDir = mkdtempSync(join(tmpdir(), 'dsh-relay-test-'))
  const upstream = await fakeUpstream()
  const port = await freePort()
  const config: RelayConfig = {
    port,
    publicOrigin: `http://127.0.0.1:${port}`,
    dataDir,
    newapiBaseUrl: upstream.url,
    newapiKey: 'sk-test-upstream',
    sessionSecret: 'test-secret-'.repeat(4),
    tokenTtlDays: 30,
    brandName: 'Relay Test',
    models: [{ id: 'test-model', name: 'Test Model', upstream: 'upstream-model', context_window: 4096, max_output_tokens: 512 }],
    allowRegistration: true,
  }
  const relay = createRelay(config)
  await new Promise<void>((resolvePromise) => relay.server.listen(port, '127.0.0.1', resolvePromise))
  return {
    relay,
    origin: `http://127.0.0.1:${port}`,
    dataDir,
    upstream,
    close: async () => {
      await relay.close()
      await new Promise<void>((resolvePromise) => upstream.server.close(() => resolvePromise()))
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function csrfFrom(html: string): string {
  const match = /name="csrf" value="([^"]+)"/u.exec(html)
  assert.ok(match, 'csrf field present')
  return match[1] as string
}

test('dsh relay authorization, models, inference, and logout', async () => {
  const b = await bench()
  try {
    const { verifier, challenge } = pkce()
    const state = randomBytes(16).toString('base64url')
    const redirectUri = 'http://127.0.0.1:43210/oauth/callback'

    const initResponse = await fetch(`${b.origin}/auth-api/v0/dsh/auth_init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code_challenge: challenge, code_challenge_method: 'S256', state, redirect_uri: redirectUri, locale: 'en_US', login_source: 'desktop' }),
    })
    assert.equal(initResponse.status, 200)
    const init = await initResponse.json() as { code: number; data: { biz_code: number; biz_data: { authorize_url: string; authorize_id: string; expires_in: number } } }
    assert.equal(init.code, 0)
    assert.equal(init.data.biz_code, 0)
    assert.ok(init.data.biz_data.authorize_url.startsWith(`${b.origin}/dsh/authorize?tx=`))
    assert.equal(init.data.biz_data.expires_in, 300)

    const page = await fetch(init.data.biz_data.authorize_url)
    assert.equal(page.status, 200)
    // The browser blocks a form POST redirect to the loopback callback unless
    // that origin is allowed by form-action.
    assert.match(page.headers.get('content-security-policy') ?? '', /form-action[^;]*127\.0\.0\.1:\*/u)
    const csrf = csrfFrom(await page.text())

    const register = await fetch(`${b.origin}/dsh/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ tx: init.data.biz_data.authorize_id, csrf, mode: 'register', email: 'user@example.com', password: 'password123' }),
      redirect: 'manual',
    })
    assert.equal(register.status, 302)
    const location = new URL(register.headers.get('location') ?? '')
    assert.equal(location.origin + location.pathname, redirectUri)
    assert.equal(location.searchParams.get('state'), state)
    const code = location.searchParams.get('code')
    assert.ok(code)

    const exchange = await fetch(`${b.origin}/auth-api/v0/dsh/auth_exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri, device_id: '00000000-0000-4000-8000-000000000000', device_model: 'test', os_version: 'test' }),
    })
    assert.equal(exchange.status, 200)
    const exchanged = await exchange.json() as { data: { biz_data: { token: string; authorized_url: string; user: { email: string; id: string } } } }
    const token = exchanged.data.biz_data.token
    assert.match(token, /^[!-~]+$/u)
    assert.equal(exchanged.data.biz_data.authorized_url, `${b.origin}/dsh/authorized`)
    assert.equal(exchanged.data.biz_data.user.email, 'user@example.com')
    assert.ok(exchanged.data.biz_data.user.id)

    const replay = await fetch(`${b.origin}/auth-api/v0/dsh/auth_exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
    })
    assert.equal(replay.status, 400)

    const current = await fetch(`${b.origin}/auth-api/v0/users/current`, { headers: { 'x-dsh-auth-token': token } })
    assert.equal(current.status, 200)
    const currentBody = await current.json() as { data: { biz_data: { email: string } } }
    assert.equal(currentBody.data.biz_data.email, 'user@example.com')

    const models = await fetch(`${b.origin}/models`, { headers: { 'x-dsh-auth-token': token } })
    assert.equal(models.status, 200)
    const listing = await models.json() as { data: Array<{ id: string; api_capabilities: { anthropic_messages: unknown } }> }
    assert.equal(listing.data[0]?.id, 'test-model')
    assert.ok(listing.data[0]?.api_capabilities.anthropic_messages)

    const completion = await fetch(`${b.origin}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-auth-token': token, accept: 'text/event-stream', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'test-model', max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(completion.status, 200)
    assert.equal(completion.headers.get('content-type'), 'text/event-stream')
    const text = await completion.text()
    assert.equal((text.match(/event: message_start/gu) ?? []).length, 1)
    assert.match(text, /message_stop/u)
    assert.equal(b.upstream.seen.authorization, 'Bearer sk-test-upstream')
    assert.equal(b.upstream.seen.model, 'upstream-model')

    const logout = await fetch(`${b.origin}/auth-api/v0/users/logout`, { method: 'POST', headers: { 'x-dsh-auth-token': token } })
    assert.equal(logout.status, 200)
    const after = await fetch(`${b.origin}/auth-api/v0/users/current`, { headers: { 'x-dsh-auth-token': token } })
    assert.equal(after.status, 401)
  } finally {
    await b.close()
  }
})

test('relay rejects non-loopback callbacks and wrong PKCE', async () => {
  const b = await bench()
  try {
    const { challenge } = pkce()
    const badRedirect = await fetch(`${b.origin}/auth-api/v0/dsh/auth_init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code_challenge: challenge, code_challenge_method: 'S256', state: 's', redirect_uri: 'https://example.com/oauth/callback' }),
    })
    assert.equal(badRedirect.status, 400)

    const init = await fetch(`${b.origin}/auth-api/v0/dsh/auth_init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code_challenge: challenge, code_challenge_method: 'S256', state: 's', redirect_uri: 'http://127.0.0.1:43210/oauth/callback' }),
    })
    const body = await init.json() as { data: { biz_data: { authorize_id: string } } }
    const page = await fetch(`${b.origin}/dsh/authorize?tx=${body.data.biz_data.authorize_id}`)
    const csrf = csrfFrom(await page.text())
    const register = await fetch(`${b.origin}/dsh/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ tx: body.data.biz_data.authorize_id, csrf, mode: 'register', email: 'other@example.com', password: 'password123' }),
      redirect: 'manual',
    })
    const code = new URL(register.headers.get('location') ?? '').searchParams.get('code')
    const wrongVerifier = pkce().verifier
    const exchange = await fetch(`${b.origin}/auth-api/v0/dsh/auth_exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: wrongVerifier, redirect_uri: 'http://127.0.0.1:43210/oauth/callback' }),
    })
    assert.equal(exchange.status, 400)
  } finally {
    await b.close()
  }
})
