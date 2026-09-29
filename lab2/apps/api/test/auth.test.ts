import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { call, cookieHeaderFrom, createTestContext, registerUser, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

test('register creates the user, returns an access token and sets an httpOnly refresh cookie', async () => {
  const { response, credentials } = await registerUser(context.app)
  expect(response.status).toBe(201)
  expect(response.body.user).toMatchObject({ email: credentials.email, name: 'Test User', role: 'user', status: 'active' })
  expect(JSON.stringify(response.body)).not.toContain('password')
  const [cookie] = response.setCookie
  expect(cookie).toContain('refresh_token=')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('Path=/api/auth')
  expect(cookie).toContain('SameSite=Lax')
})

test('register rejects a duplicate email regardless of letter case with 409', async () => {
  await registerUser(context.app, { email: 'User@Example.COM' })
  const response = await call(context.app, 'POST', '/auth/register', {
    body: { email: 'user@example.com', name: 'Other', password: 'password123' },
  })
  expect(response.status).toBe(409)
  expect(response.body.code).toBe('CONFLICT')
})

test('register validates every field and reports which ones failed', async () => {
  const response = await call(context.app, 'POST', '/auth/register', {
    body: { email: 'not-an-email', name: 'A', password: 'short' },
  })
  expect(response.status).toBe(400)
  const failedFields = response.body.data.issues.map((issue: { path: string[] }) => issue.path[0]).sort()
  expect(failedFields).toEqual(['email', 'name', 'password'])
})

test('register rejects passwords longer than 72 characters', async () => {
  const response = await call(context.app, 'POST', '/auth/register', {
    body: { email: 'long@example.com', name: 'Long', password: 'a'.repeat(73) },
  })
  expect(response.status).toBe(400)
})

test('login succeeds case-insensitively on the email', async () => {
  const { credentials } = await registerUser(context.app, { email: 'Mixed@Example.com' })
  const response = await call(context.app, 'POST', '/auth/login', {
    body: { email: 'mixed@EXAMPLE.com', password: credentials.password },
  })
  expect(response.status).toBe(200)
  expect(response.body.accessToken).toBeTruthy()
})

test('login gives the same 401 message for a wrong password and an unknown email', async () => {
  const { credentials } = await registerUser(context.app)
  const wrongPassword = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: 'wrong-password' },
  })
  const unknownEmail = await call(context.app, 'POST', '/auth/login', {
    body: { email: 'nobody@example.com', password: 'password123' },
  })
  expect(wrongPassword.status).toBe(401)
  expect(unknownEmail.status).toBe(401)
  expect(wrongPassword.body.message).toBe(unknownEmail.body.message)
})

test('five wrong passwords lock the account with 429 and Retry-After, even for the right password', async () => {
  const { credentials } = await registerUser(context.app)
  const statuses: number[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await call(context.app, 'POST', '/auth/login', {
      body: { email: credentials.email, password: 'wrong-password' },
    })
    statuses.push(response.status)
  }
  expect(statuses).toEqual([401, 401, 401, 401, 429])

  const lockedOut = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: credentials.password },
  })
  expect(lockedOut.status).toBe(429)
  expect(Number(lockedOut.headers['retry-after'])).toBeGreaterThan(0)
  expect(lockedOut.body.data.retryAfterSeconds).toBeGreaterThan(0)
})

test('lockout ends once locked_until has passed and the counter starts from zero', async () => {
  const { credentials, user } = await registerUser(context.app)
  for (let attempt = 0; attempt < 5; attempt++) {
    await call(context.app, 'POST', '/auth/login', { body: { email: credentials.email, password: 'wrong-password' } })
  }
  await context.pool.query("update users set locked_until = now() - interval '1 second' where id = $1", [user.id])
  const response = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: credentials.password },
  })
  expect(response.status).toBe(200)
})

test('a blocked user cannot log in and receives 403', async () => {
  const { credentials, user } = await registerUser(context.app)
  await context.pool.query("update users set status = 'blocked' where id = $1", [user.id])
  const response = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: credentials.password },
  })
  expect(response.status).toBe(403)
})

test('me returns the current user for a valid token', async () => {
  const { accessToken, user } = await registerUser(context.app)
  const response = await call(context.app, 'GET', '/auth/me', { token: accessToken })
  expect(response.status).toBe(200)
  expect(response.body.id).toBe(user.id)
})

test('me rejects missing, malformed and forged credentials with 401', async () => {
  const missing = await call(context.app, 'GET', '/auth/me')
  const garbage = await call(context.app, 'GET', '/auth/me', { token: 'not-a-jwt' })
  const wrongScheme = await call(context.app, 'GET', '/auth/me', { headers: { authorization: 'Basic abc' } })
  const emptyBearer = await call(context.app, 'GET', '/auth/me', { headers: { authorization: 'Bearer ' } })
  expect([missing.status, garbage.status, wrongScheme.status, emptyBearer.status]).toEqual([401, 401, 401, 401])
})

test('refresh rotates the token: new cookie works, the old one is rejected without killing the session', async () => {
  const { refreshCookie } = await registerUser(context.app)
  const rotated = await call(context.app, 'POST', '/auth/refresh', { cookie: refreshCookie })
  expect(rotated.status).toBe(200)
  const newCookie = cookieHeaderFrom(rotated.setCookie)
  expect(newCookie).not.toBe(refreshCookie)

  const replayedInsideGrace = await call(context.app, 'POST', '/auth/refresh', { cookie: refreshCookie })
  expect(replayedInsideGrace.status).toBe(401)

  const me = await call(context.app, 'GET', '/auth/me', { token: rotated.body.accessToken })
  expect(me.status).toBe(200)
  const again = await call(context.app, 'POST', '/auth/refresh', { cookie: newCookie })
  expect(again.status).toBe(200)
})

test('replaying a rotated refresh token after the grace window revokes every session of the user', async () => {
  const { refreshCookie, user } = await registerUser(context.app)
  const rotated = await call(context.app, 'POST', '/auth/refresh', { cookie: refreshCookie })
  await context.pool.query("update sessions set rotated_at = now() - interval '1 minute' where user_id = $1", [user.id])

  const replay = await call(context.app, 'POST', '/auth/refresh', { cookie: refreshCookie })
  expect(replay.status).toBe(401)

  const me = await call(context.app, 'GET', '/auth/me', { token: rotated.body.accessToken })
  expect(me.status).toBe(401)
  const legitimate = await call(context.app, 'POST', '/auth/refresh', { cookie: cookieHeaderFrom(rotated.setCookie) })
  expect(legitimate.status).toBe(401)
})

test('two simultaneous refreshes with one cookie yield exactly one success', async () => {
  const { refreshCookie } = await registerUser(context.app)
  const [first, second] = await Promise.all([
    call(context.app, 'POST', '/auth/refresh', { cookie: refreshCookie }),
    call(context.app, 'POST', '/auth/refresh', { cookie: refreshCookie }),
  ])
  expect([first.status, second.status].sort()).toEqual([200, 401])
})

test('refresh without a cookie or with garbage gives 401, never 500', async () => {
  const missing = await call(context.app, 'POST', '/auth/refresh')
  const garbage = await call(context.app, 'POST', '/auth/refresh', { cookie: 'refresh_token=%E0%A4%A' })
  const unknown = await call(context.app, 'POST', '/auth/refresh', { cookie: 'refresh_token=unknown-token' })
  expect([missing.status, garbage.status, unknown.status]).toEqual([401, 401, 401])
})

test('logout revokes the session and clears the cookie, and works with an expired access token', async () => {
  const { refreshCookie, accessToken } = await registerUser(context.app)
  const response = await call(context.app, 'POST', '/auth/logout', { cookie: refreshCookie })
  expect(response.status).toBe(204)
  expect(response.setCookie[0]).toContain('Max-Age=0')
  const me = await call(context.app, 'GET', '/auth/me', { token: accessToken })
  expect(me.status).toBe(401)
})

test('logout without a cookie is idempotent', async () => {
  const response = await call(context.app, 'POST', '/auth/logout')
  expect(response.status).toBe(204)
})

test('a blocked user with a still-valid access token is rejected', async () => {
  const { accessToken, user } = await registerUser(context.app)
  await context.pool.query("update users set status = 'blocked' where id = $1", [user.id])
  const response = await call(context.app, 'GET', '/auth/me', { token: accessToken })
  expect(response.status).toBe(401)
})
