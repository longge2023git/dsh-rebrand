/** Tokens, password hashes, cookies, and response helpers. */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** URL-safe random token with `bytes` of entropy. */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

/** Hex SHA-256 of a token, the only form persisted. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Hex HMAC-SHA-256 used for cookies and CSRF tokens. */
export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

/** Constant-time string equality that tolerates unequal lengths. */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Derive a scrypt password hash. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${derived}`
}

/** Verify a scrypt password hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split('$')
  if (scheme !== 'scrypt' || salt === undefined || expected === undefined) return false
  const derived = scryptSync(password, salt, 64).toString('hex')
  return safeEqual(derived, expected)
}

/** Verify an RFC 7636 S256 challenge against its verifier. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(verifier)) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  return safeEqual(computed, challenge)
}

/** Parse a Cookie header into a name/value map. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
  }
  return cookies
}

/** Serialize one Set-Cookie value. */
export function cookie(name: string, value: string, options: {
  readonly maxAgeSeconds?: number
  readonly secure: boolean
}): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`)
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

/** Read a request body with a hard byte limit. */
export async function readBody(req: IncomingMessage, limit = 1_048_576): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > limit) throw new HttpError(413, 'request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/** Read and parse a JSON body. */
export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const text = (await readBody(req)).toString('utf8')
  if (text.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new HttpError(400, 'JSON body must be an object')
  return parsed as Record<string, unknown>
}

/** Error carrying an HTTP status and a safe message. */
export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Write one JSON response with no-store caching. */
export function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

/** Write one HTML response with the relay's security headers. */
export function sendHtml(res: ServerResponse, status: number, html: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://127.0.0.1:* http://localhost:*; frame-ancestors 'none'; base-uri 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(html)
}

/** Escape text for HTML interpolation. */
export function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&#39;')
}

/** Read the DSH account token from its header (or a bearer token for manual tests). */
export function accountToken(req: IncomingMessage): string | undefined {
  const direct = req.headers['x-dsh-auth-token']
  if (typeof direct === 'string' && direct.length > 0) return direct
  const authorization = req.headers.authorization
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) return authorization.slice(7)
  return undefined
}
