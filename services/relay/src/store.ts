/** SQLite persistence for accounts, login transactions, tokens, and browser sessions. */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** One registered account. */
export interface User {
  readonly id: string
  readonly email: string
  readonly passwordHash: string
  readonly createdAt: number
}

/** One browser sign-in transaction. */
export interface AuthTx {
  readonly id: string
  readonly challenge: string
  readonly state: string
  readonly redirectUri: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly userId: string | null
  readonly codeHash: string | null
  readonly codeExpiresAt: number | null
  readonly usedAt: number | null
  readonly cancelledAt: number | null
}

interface UserRow {
  id: string
  email: string
  password_hash: string
  created_at: number
}

interface TxRow {
  id: string
  challenge: string
  state: string
  redirect_uri: string
  created_at: number
  expires_at: number
  user_id: string | null
  code_hash: string | null
  code_expires_at: number | null
  used_at: number | null
  cancelled_at: number | null
}

function user(row: UserRow): User {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at }
}

function tx(row: TxRow): AuthTx {
  return {
    id: row.id, challenge: row.challenge, state: row.state, redirectUri: row.redirect_uri,
    createdAt: row.created_at, expiresAt: row.expires_at, userId: row.user_id,
    codeHash: row.code_hash, codeExpiresAt: row.code_expires_at, usedAt: row.used_at, cancelledAt: row.cancelled_at,
  }
}

/** Relay database handle. */
export class Store {
  readonly #db: DatabaseSync

  /** @param dataDir - directory holding `relay.sqlite`. */
  constructor(dataDir: string) {
    const path = join(dataDir, 'relay.sqlite')
    mkdirSync(dirname(path), { recursive: true })
    this.#db = new DatabaseSync(path)
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_tx (
        id TEXT PRIMARY KEY, challenge TEXT NOT NULL, state TEXT NOT NULL, redirect_uri TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_id TEXT, code_hash TEXT,
        code_expires_at INTEGER, used_at INTEGER, cancelled_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS auth_tx_code ON auth_tx (code_hash);
      CREATE TABLE IF NOT EXISTS tokens (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS browser_sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
    `)
  }

  /** Insert one account; a duplicate email throws. */
  createUser(id: string, email: string, passwordHash: string, now: number): User {
    this.#db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(id, email, passwordHash, now)
    return { id, email, passwordHash, createdAt: now }
  }

  /** Find an account by lowercased email. */
  userByEmail(email: string): User | undefined {
    const row = this.#db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
    return row === undefined ? undefined : user(row)
  }

  /** Find an account by id. */
  userById(id: string): User | undefined {
    const row = this.#db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    return row === undefined ? undefined : user(row)
  }

  /** Insert one login transaction. */
  createTx(input: {
    readonly id: string; readonly challenge: string; readonly state: string; readonly redirectUri: string
    readonly createdAt: number; readonly expiresAt: number
  }): void {
    this.#db.prepare(`INSERT INTO auth_tx (id, challenge, state, redirect_uri, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(input.id, input.challenge, input.state, input.redirectUri, input.createdAt, input.expiresAt)
  }

  /** Read one login transaction. */
  txById(id: string): AuthTx | undefined {
    const row = this.#db.prepare('SELECT * FROM auth_tx WHERE id = ?').get(id) as TxRow | undefined
    return row === undefined ? undefined : tx(row)
  }

  /** Read the transaction holding one authorization code. */
  txByCodeHash(hash: string): AuthTx | undefined {
    const row = this.#db.prepare('SELECT * FROM auth_tx WHERE code_hash = ?').get(hash) as TxRow | undefined
    return row === undefined ? undefined : tx(row)
  }

  /** Attach an issued code to its transaction. */
  setTxCode(id: string, userId: string, codeHash: string, codeExpiresAt: number): void {
    this.#db.prepare('UPDATE auth_tx SET user_id = ?, code_hash = ?, code_expires_at = ? WHERE id = ?')
      .run(userId, codeHash, codeExpiresAt, id)
  }

  /** Mark a code as exchanged. */
  consumeTx(id: string, now: number): void {
    this.#db.prepare('UPDATE auth_tx SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, id)
  }

  /** Mark a transaction cancelled. */
  cancelTx(id: string, now: number): void {
    this.#db.prepare('UPDATE auth_tx SET cancelled_at = ? WHERE id = ? AND used_at IS NULL').run(now, id)
  }

  /** Store one issued account token hash. */
  createToken(hash: string, userId: string, expiresAt: number): void {
    this.#db.prepare('INSERT INTO tokens (hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash, userId, expiresAt)
  }

  /** Resolve a live token to its account. */
  tokenUser(hash: string, now: number): User | undefined {
    const row = this.#db.prepare('SELECT user_id, expires_at, revoked_at FROM tokens WHERE hash = ?').get(hash) as
      { user_id: string; expires_at: number; revoked_at: number | null } | undefined
    if (row === undefined || row.revoked_at !== null || row.expires_at <= now) return undefined
    return this.userById(row.user_id)
  }

  /** Revoke one token; returns whether a live row changed. */
  revokeToken(hash: string, now: number): boolean {
    const result = this.#db.prepare('UPDATE tokens SET revoked_at = ? WHERE hash = ? AND revoked_at IS NULL').run(now, hash)
    return Number(result.changes) > 0
  }

  /** Store one browser session hash. */
  createSession(hash: string, userId: string, expiresAt: number): void {
    this.#db.prepare('INSERT INTO browser_sessions (hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash, userId, expiresAt)
  }

  /** Resolve a live browser session. */
  sessionUser(hash: string, now: number): User | undefined {
    const row = this.#db.prepare('SELECT user_id, expires_at FROM browser_sessions WHERE hash = ?').get(hash) as
      { user_id: string; expires_at: number } | undefined
    if (row === undefined || row.expires_at <= now) return undefined
    return this.userById(row.user_id)
  }

  /** Delete one browser session. */
  deleteSession(hash: string): void {
    this.#db.prepare('DELETE FROM browser_sessions WHERE hash = ?').run(hash)
  }

  /** Close the database. */
  close(): void {
    this.#db.close()
  }
}
