/** Relay configuration read once at startup. */

/** One model exposed to DSH through `/models`. */
export interface ModelConfig {
  /** Model id DSH sends in Messages requests. */
  readonly id: string
  /** Display name; defaults to the id. */
  readonly name?: string
  /** Model id sent upstream; defaults to the id. */
  readonly upstream?: string
  /** Combined context window advertised to DSH. */
  readonly context_window?: number
  /** Maximum output tokens advertised to DSH. */
  readonly max_output_tokens?: number
  /** Advertise image input. */
  readonly image?: boolean
}

/** Immutable process configuration. */
export interface RelayConfig {
  readonly port: number
  readonly publicOrigin: string
  readonly dataDir: string
  readonly newapiBaseUrl: string
  readonly newapiKey: string | undefined
  readonly sessionSecret: string
  readonly tokenTtlDays: number
  readonly brandName: string
  readonly models: readonly ModelConfig[]
  readonly allowRegistration: boolean
}

const ORIGIN_PATTERN = /^https?:\/\/[^/?#]+$/u
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Validate a URL origin without credentials, path, query, or hash. */
export function parseOrigin(value: string, subject: string, allowInsecureHttp = false): string {
  if (!ORIGIN_PATTERN.test(value)) throw new Error(`${subject} must be an http(s) origin without path, query, or hash`)
  const url = new URL(value)
  if (url.username !== '' || url.password !== '') throw new Error(`${subject} must not carry credentials`)
  if (url.protocol === 'http:' && !allowInsecureHttp && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${subject} must use https outside loopback`)
  }
  return url.origin
}

function positiveInteger(value: string | undefined, fallback: number, subject: string): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${subject} must be a positive integer`)
  return parsed
}

function parseModels(value: string | undefined): readonly ModelConfig[] {
  const text = value === undefined || value.trim() === '' ? '[]' : value
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('MODELS must be a JSON array')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('MODELS must be a non-empty JSON array')
  return parsed.map((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error(`MODELS[${index}] must be an object`)
    const record = entry as Record<string, unknown>
    const id = record.id
    if (typeof id !== 'string' || id.length === 0) throw new Error(`MODELS[${index}].id must be a non-empty string`)
    const name = record.name
    const upstream = record.upstream
    const window = record.context_window
    const output = record.max_output_tokens
    if (name !== undefined && typeof name !== 'string') throw new Error(`MODELS[${index}].name must be a string`)
    if (upstream !== undefined && typeof upstream !== 'string') throw new Error(`MODELS[${index}].upstream must be a string`)
    if (window !== undefined && (!Number.isSafeInteger(window) || (window as number) <= 0)) {
      throw new Error(`MODELS[${index}].context_window must be a positive integer`)
    }
    if (output !== undefined && (!Number.isSafeInteger(output) || (output as number) <= 0)) {
      throw new Error(`MODELS[${index}].max_output_tokens must be a positive integer`)
    }
    return {
      id,
      ...name === undefined ? {} : { name },
      ...upstream === undefined ? {} : { upstream },
      ...window === undefined ? {} : { context_window: window as number },
      ...output === undefined ? {} : { max_output_tokens: output as number },
      ...record.image === true ? { image: true } : {},
    }
  })
}

/** Read and validate the process environment. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const publicOrigin = parseOrigin(env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:18082', 'PUBLIC_ORIGIN')
  const port = positiveInteger(env.PORT, Number(new URL(publicOrigin).port || (new URL(publicOrigin).protocol === 'https:' ? 443 : 80)), 'PORT')
  const secret = env.SESSION_SECRET ?? ''
  if (secret.length < 32 || secret.startsWith('change-me')) throw new Error('SESSION_SECRET must be at least 32 random characters; generate one with openssl rand -hex 32')
  return {
    port,
    publicOrigin,
    dataDir: env.DATA_DIR ?? './data',
    newapiBaseUrl: parseOrigin(env.NEWAPI_BASE_URL ?? 'http://127.0.0.1:13000', 'NEWAPI_BASE_URL', true),
    newapiKey: env.NEWAPI_KEY === undefined || env.NEWAPI_KEY === '' ? undefined : env.NEWAPI_KEY,
    sessionSecret: secret,
    tokenTtlDays: positiveInteger(env.TOKEN_TTL_DAYS, 30, 'TOKEN_TTL_DAYS'),
    brandName: env.BRAND_NAME ?? 'DSH Relay',
    models: parseModels(env.MODELS),
    allowRegistration: (env.ALLOW_REGISTRATION ?? 'true') !== 'false',
  }
}
