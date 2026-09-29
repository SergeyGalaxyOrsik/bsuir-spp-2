import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { buildApp } from '../src/app'
import { repositoriesFor } from '../src/repositories'
import { call, createTestContext, MemoryFileStorage, RecordingMailer, registerUser, testConfig, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

test('an unexpected failure yields a generic 500 without leaking internals', async () => {
  const registered = await registerUser(context.app)
  const created = await call(context.app, 'POST', '/prompts', {
    token: registered.accessToken,
    body: { title: 'T', body: 'B', model: 'gpt', tags: [] },
  })
  const failingStorage = new MemoryFileStorage()
  failingStorage.read = async () => {
    throw new Error('disk exploded at /secret/path')
  }
  await context.pool.query(
    "update prompts set attachment_path = 'p', attachment_name = 'a.txt', attachment_mime = 'text/plain', attachment_size = 1",
  )
  const app = await buildApp({
    config: testConfig(),
    mailer: new RecordingMailer(),
    storage: failingStorage,
    ...repositoriesFor(context.pool),
  })

  const response = await call(app, 'GET', `/prompts/${created.body.id}/attachment`, { token: registered.accessToken })
  expect(response.status).toBe(500)
  expect(JSON.stringify(response.body)).not.toContain('disk exploded')
  expect(JSON.stringify(response.body)).not.toContain('/secret/path')
  await app.close()
})

test('validation errors carry per-field issues while 404 carries just a message', async () => {
  const { accessToken } = await registerUser(context.app)
  const invalid = await call(context.app, 'POST', '/prompts', { token: accessToken, body: { title: '' } })
  const missing = await call(context.app, 'GET', '/prompts/00000000-0000-4000-8000-000000000000', { token: accessToken })
  expect(invalid.body).toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  expect(Array.isArray(invalid.body.data.issues)).toBe(true)
  expect(missing.body).toMatchObject({ code: 'NOT_FOUND', status: 404, message: 'Prompt not found' })
})
