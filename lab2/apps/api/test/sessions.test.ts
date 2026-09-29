import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { call, createTestContext, registerUser, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

async function loginAgain(email: string, password: string, userAgent: string) {
  const response = await call(context.app, 'POST', '/auth/login', {
    body: { email, password },
    headers: { 'user-agent': userAgent },
  })
  return response.body.accessToken as string
}

test('lists own active sessions and marks the current one', async () => {
  const { credentials, accessToken } = await registerUser(context.app)
  const secondToken = await loginAgain(credentials.email, credentials.password, 'Firefox')

  const response = await call(context.app, 'GET', '/auth/sessions', { token: secondToken })
  expect(response.status).toBe(200)
  expect(response.body).toHaveLength(2)
  const current = response.body.filter((session: { current: boolean }) => session.current)
  expect(current).toHaveLength(1)
  expect(current[0].userAgent).toBe('Firefox')
  expect(accessToken).toBeTruthy()
})

test('a user can terminate another of their own sessions, which invalidates its access token', async () => {
  const { credentials, accessToken: firstToken } = await registerUser(context.app)
  const secondToken = await loginAgain(credentials.email, credentials.password, 'Firefox')
  const sessions = await call(context.app, 'GET', '/auth/sessions', { token: secondToken })
  const other = sessions.body.find((session: { current: boolean }) => !session.current)

  const revoked = await call(context.app, 'DELETE', `/auth/sessions/${other.id}`, { token: secondToken })
  expect(revoked.status).toBe(204)
  expect((await call(context.app, 'GET', '/auth/me', { token: firstToken })).status).toBe(401)
  expect((await call(context.app, 'GET', '/auth/me', { token: secondToken })).status).toBe(200)
})

test('revoking someone else\'s session or an unknown id returns 404', async () => {
  const alice = await registerUser(context.app)
  const bob = await registerUser(context.app)
  const bobSessions = await call(context.app, 'GET', '/auth/sessions', { token: bob.accessToken })

  const foreign = await call(context.app, 'DELETE', `/auth/sessions/${bobSessions.body[0].id}`, { token: alice.accessToken })
  const unknown = await call(context.app, 'DELETE', '/auth/sessions/00000000-0000-4000-8000-000000000000', { token: alice.accessToken })
  const malformed = await call(context.app, 'DELETE', '/auth/sessions/abc', { token: alice.accessToken })
  expect([foreign.status, unknown.status, malformed.status]).toEqual([404, 404, 400])
  expect((await call(context.app, 'GET', '/auth/me', { token: bob.accessToken })).status).toBe(200)
})

test('logout-all revokes every session of the user', async () => {
  const { credentials, accessToken } = await registerUser(context.app)
  const secondToken = await loginAgain(credentials.email, credentials.password, 'Firefox')

  const response = await call(context.app, 'POST', '/auth/logout-all', { token: accessToken })
  expect(response.status).toBe(204)
  expect((await call(context.app, 'GET', '/auth/me', { token: accessToken })).status).toBe(401)
  expect((await call(context.app, 'GET', '/auth/me', { token: secondToken })).status).toBe(401)
})

test('the sixth login revokes the oldest session, keeping five active', async () => {
  const { credentials, accessToken: oldestToken } = await registerUser(context.app)
  let newestToken = oldestToken
  for (let index = 0; index < 5; index++) {
    newestToken = await loginAgain(credentials.email, credentials.password, `Browser ${index}`)
  }
  const sessions = await call(context.app, 'GET', '/auth/sessions', { token: newestToken })
  expect(sessions.body).toHaveLength(5)
  expect((await call(context.app, 'GET', '/auth/me', { token: oldestToken })).status).toBe(401)
})

test('session endpoints require authentication', async () => {
  const response = await call(context.app, 'GET', '/auth/sessions')
  expect(response.status).toBe(401)
})
