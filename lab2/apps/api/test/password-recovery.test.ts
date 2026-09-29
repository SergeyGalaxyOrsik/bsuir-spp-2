import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { call, createTestContext, registerUser, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

function tokenFromLastMail() {
  const link = context.mailer.sent.at(-1)!.resetLink
  return new URL(link).searchParams.get('token')!
}

test('forgot sends one mail with a reset link for an existing account and answers 202', async () => {
  const { credentials } = await registerUser(context.app)
  const response = await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })
  expect(response.status).toBe(202)
  expect(context.mailer.sent).toHaveLength(1)
  expect(context.mailer.sent[0]!.to).toBe(credentials.email)
  expect(context.mailer.sent[0]!.resetLink).toStartWith(`${context.config.webUrl}/reset-password?token=`)
})

test('forgot answers identically for an unknown email and sends nothing', async () => {
  const { credentials } = await registerUser(context.app)
  const known = await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })
  const unknown = await call(context.app, 'POST', '/auth/password/forgot', { body: { email: 'nobody@example.com' } })
  expect(unknown.status).toBe(202)
  expect(unknown.body).toEqual(known.body)
  expect(context.mailer.sent).toHaveLength(1)
})

test('forgot rejects a malformed email with 400', async () => {
  const response = await call(context.app, 'POST', '/auth/password/forgot', { body: { email: 'nope' } })
  expect(response.status).toBe(400)
})

test('forgot sends nothing to a blocked account but still answers 202', async () => {
  const { credentials, user } = await registerUser(context.app)
  await context.pool.query("update users set status = 'blocked' where id = $1", [user.id])
  const response = await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })
  expect(response.status).toBe(202)
  expect(context.mailer.sent).toHaveLength(0)
})

test('reset changes the password, revokes all sessions and invalidates the old password', async () => {
  const { credentials, accessToken } = await registerUser(context.app)
  await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })

  const reset = await call(context.app, 'POST', '/auth/password/reset', {
    body: { token: tokenFromLastMail(), password: 'brand-new-password' },
  })
  expect(reset.status).toBe(200)

  expect((await call(context.app, 'GET', '/auth/me', { token: accessToken })).status).toBe(401)
  const oldLogin = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: credentials.password },
  })
  const newLogin = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: 'brand-new-password' },
  })
  expect([oldLogin.status, newLogin.status]).toEqual([401, 200])
})

test('a reset token works once only', async () => {
  const { credentials } = await registerUser(context.app)
  await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })
  const token = tokenFromLastMail()
  const first = await call(context.app, 'POST', '/auth/password/reset', { body: { token, password: 'brand-new-password' } })
  const second = await call(context.app, 'POST', '/auth/password/reset', { body: { token, password: 'another-password' } })
  expect([first.status, second.status]).toEqual([200, 400])
})

test('garbage, expired and weak-password resets are rejected with 400', async () => {
  const { credentials } = await registerUser(context.app)
  await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })
  const token = tokenFromLastMail()

  const garbage = await call(context.app, 'POST', '/auth/password/reset', { body: { token: 'garbage', password: 'brand-new-password' } })
  const weak = await call(context.app, 'POST', '/auth/password/reset', { body: { token, password: 'short' } })
  await context.pool.query("update password_reset_tokens set expires_at = now() - interval '1 second'")
  const expired = await call(context.app, 'POST', '/auth/password/reset', { body: { token, password: 'brand-new-password' } })
  expect([garbage.status, weak.status, expired.status]).toEqual([400, 400, 400])
})

test('reset clears an active lockout so the user can log in with the new password', async () => {
  const { credentials } = await registerUser(context.app)
  for (let attempt = 0; attempt < 5; attempt++) {
    await call(context.app, 'POST', '/auth/login', { body: { email: credentials.email, password: 'wrong-password' } })
  }
  await call(context.app, 'POST', '/auth/password/forgot', { body: { email: credentials.email } })
  await call(context.app, 'POST', '/auth/password/reset', { body: { token: tokenFromLastMail(), password: 'brand-new-password' } })
  const login = await call(context.app, 'POST', '/auth/login', {
    body: { email: credentials.email, password: 'brand-new-password' },
  })
  expect(login.status).toBe(200)
})
