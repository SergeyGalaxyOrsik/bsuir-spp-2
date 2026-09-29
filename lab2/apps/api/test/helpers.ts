import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { buildApp } from '../src/app'
import { loadConfig, type Config } from '../src/config'
import { createPool } from '../src/db/pool'
import { migrate } from '../src/db/migrate'
import type { Mailer } from '../src/mail/mailer'
import type { FileStorage, StoredFile } from '../src/storage/file-storage'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://prompts:prompts@localhost:5432/prompts_test'

export class RecordingMailer implements Mailer {
  sent: { to: string; resetLink: string }[] = []

  async sendPasswordReset(input: { to: string; resetLink: string }) {
    this.sent.push(input)
  }
}

export class MemoryFileStorage implements FileStorage {
  files = new Map<string, Buffer>()

  async save(file: File): Promise<StoredFile> {
    const path = randomUUID()
    this.files.set(path, Buffer.from(await file.arrayBuffer()))
    return { path, name: file.name, mime: file.type, size: file.size }
  }

  async read(path: string) {
    const content = this.files.get(path)
    if (!content) throw new Error('file not found')
    return content
  }

  async remove(path: string) {
    this.files.delete(path)
  }
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'x'.repeat(32),
      LOG_LEVEL: 'silent',
      RATE_LIMIT_STRICT_MAX: '1000',
      RATE_LIMIT_GLOBAL_MAX: '100000',
    }),
    ...overrides,
  }
}

async function ensureDatabaseExists(databaseUrl: string) {
  const target = new URL(databaseUrl)
  const databaseName = target.pathname.slice(1)
  target.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: target.toString() })
  await admin.connect()
  const existing = await admin.query('select 1 from pg_database where datname = $1', [databaseName])
  if (!existing.rowCount) await admin.query(`create database "${databaseName}"`)
  await admin.end()
}

export async function createTestContext(overrides: Partial<Config> = {}) {
  const config = testConfig(overrides)
  await ensureDatabaseExists(config.databaseUrl)
  const pool = createPool(config.databaseUrl)
  await migrate(pool, config.migrationsDir)
  const mailer = new RecordingMailer()
  const storage = new MemoryFileStorage()
  const app = await buildApp({ config, mailer, storage })

  return {
    app,
    pool,
    mailer,
    storage,
    config,
    async reset() {
      await pool.query('truncate users, sessions, password_reset_tokens, prompts cascade')
      mailer.sent = []
      storage.files.clear()
    },
    async close() {
      await app.close()
      await pool.end()
    },
  }
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>

type CallOptions = {
  body?: unknown
  token?: string
  cookie?: string
  headers?: Record<string, string>
  payload?: Buffer
  contentType?: string
}

export async function call(app: TestContext['app'], method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { ...options.headers }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.cookie) headers.cookie = options.cookie
  if (options.contentType) headers['content-type'] = options.contentType
  const response = await app.inject({
    method,
    url: `/api${path}`,
    headers,
    payload: options.payload ?? (options.body as object | undefined),
  })
  const text = response.body
  const isJson = (response.headers['content-type'] ?? '').toString().includes('json')
  return {
    status: response.statusCode,
    headers: response.headers,
    body: isJson && text ? JSON.parse(text) : text,
    rawBody: response.rawPayload,
    setCookie: [response.headers['set-cookie']].flat().filter(Boolean) as string[],
  }
}

export async function multipart(fields: Record<string, string | File>) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  const response = new Response(form)
  return {
    payload: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? '',
  }
}
