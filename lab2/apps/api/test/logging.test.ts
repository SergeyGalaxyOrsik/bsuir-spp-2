import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { Writable } from 'node:stream'
import pino from 'pino'
import { buildApp } from '../src/app'
import { repositoriesFor } from '../src/repositories'
import { call, MemoryFileStorage, RecordingMailer, testConfig, createTestContext, registerUser, type TestContext } from './helpers'

let context: TestContext
let app: Awaited<ReturnType<typeof buildApp>>
const lines: string[] = []

beforeAll(async () => {
  context = await createTestContext()
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  app = await buildApp(
    { config: testConfig(), mailer: new RecordingMailer(), storage: new MemoryFileStorage(), ...repositoriesFor(context.pool) },
    { logger: pino({ level: 'info', redact: ['req.headers.authorization'] }, stream) },
  )
})

beforeEach(async () => {
  await context.reset()
  lines.length = 0
})

afterAll(async () => {
  await app.close()
  await context.close()
})

const records = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>)

test('each request logs method, path, status, duration and the request id as JSON', async () => {
  await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-42' } })
  const completed = records().find((record) => record.msg === 'request completed')!
  expect(completed).toMatchObject({ method: 'GET', path: '/health', status: 200, reqId: 'req-42' })
  expect(typeof completed.durationMs).toBe('number')
})

test('authenticated requests log the user id', async () => {
  const registered = await registerUser(app)
  lines.length = 0
  await call(app, 'GET', '/auth/me', { token: registered.accessToken })
  const completed = records().find((record) => record.msg === 'request completed')!
  expect(completed.userId).toBe(registered.user.id)
})

test('security events are logged with an event name, and secrets never appear in logs', async () => {
  const { credentials, accessToken, refreshCookie } = await registerUser(app)
  await call(app, 'POST', '/auth/login', { body: { email: credentials.email, password: 'wrong-password' } })
  await call(app, 'GET', '/auth/me', { token: accessToken })
  await call(app, 'POST', '/auth/refresh', { cookie: refreshCookie })

  const events = records().map((record) => record.event).filter(Boolean)
  expect(events).toEqual(expect.arrayContaining(['auth.register', 'auth.login.failed']))

  const everything = lines.join('\n')
  for (const secret of [credentials.password, 'wrong-password', accessToken, refreshCookie.split('=')[1]!]) {
    expect(everything).not.toContain(secret)
  }
})
