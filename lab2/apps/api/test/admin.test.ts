import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { call, createTestContext, promoteUser, registerUser, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

async function createAdmin() {
  const admin = await registerUser(context.app)
  await promoteUser(context.pool, admin.user.id, 'admin')
  return admin
}

test('admin endpoints reject anonymous callers with 401 and non-admins with 403', async () => {
  const user = await registerUser(context.app)
  const moderator = await registerUser(context.app)
  await promoteUser(context.pool, moderator.user.id, 'moderator')

  const anonymous = await call(context.app, 'GET', '/admin/users')
  const asUser = await call(context.app, 'GET', '/admin/users', { token: user.accessToken })
  const asModerator = await call(context.app, 'GET', '/admin/users', { token: moderator.accessToken })
  expect([anonymous.status, asUser.status, asModerator.status]).toEqual([401, 403, 403])
})

test('admin lists all users without password hashes', async () => {
  const admin = await createAdmin()
  await registerUser(context.app)
  const response = await call(context.app, 'GET', '/admin/users', { token: admin.accessToken })
  expect(response.status).toBe(200)
  expect(response.body).toHaveLength(2)
  expect(JSON.stringify(response.body)).not.toContain('hash')
})

test('admin changes a role, effective immediately for that user', async () => {
  const admin = await createAdmin()
  const user = await registerUser(context.app)
  const before = await call(context.app, 'GET', '/admin/users', { token: user.accessToken })
  expect(before.status).toBe(403)

  const response = await call(context.app, 'PUT', `/admin/users/${user.user.id}/role`, {
    token: admin.accessToken,
    body: { role: 'admin' },
  })
  expect(response.status).toBe(200)
  expect(response.body.role).toBe('admin')
  const after = await call(context.app, 'GET', '/admin/users', { token: user.accessToken })
  expect(after.status).toBe(200)
})

test('role and status updates validate input and target existence', async () => {
  const admin = await createAdmin()
  const invalidRole = await call(context.app, 'PUT', `/admin/users/${admin.user.id}/role`, {
    token: admin.accessToken,
    body: { role: 'superuser' },
  })
  const unknownUser = await call(context.app, 'PUT', '/admin/users/00000000-0000-4000-8000-000000000000/role', {
    token: admin.accessToken,
    body: { role: 'user' },
  })
  const malformedId = await call(context.app, 'PUT', '/admin/users/abc/status', {
    token: admin.accessToken,
    body: { status: 'blocked' },
  })
  expect([invalidRole.status, unknownUser.status, malformedId.status]).toEqual([400, 404, 400])
})

test('an admin cannot change their own role or block themselves', async () => {
  const admin = await createAdmin()
  const role = await call(context.app, 'PUT', `/admin/users/${admin.user.id}/role`, {
    token: admin.accessToken,
    body: { role: 'user' },
  })
  const status = await call(context.app, 'PUT', `/admin/users/${admin.user.id}/status`, {
    token: admin.accessToken,
    body: { status: 'blocked' },
  })
  expect([role.status, status.status]).toEqual([400, 400])
})

test('blocking a user revokes their sessions and forbids login; unblocking restores login', async () => {
  const admin = await createAdmin()
  const user = await registerUser(context.app)

  const blocked = await call(context.app, 'PUT', `/admin/users/${user.user.id}/status`, {
    token: admin.accessToken,
    body: { status: 'blocked' },
  })
  expect(blocked.body.status).toBe('blocked')
  expect((await call(context.app, 'GET', '/auth/me', { token: user.accessToken })).status).toBe(401)
  const loginWhileBlocked = await call(context.app, 'POST', '/auth/login', {
    body: { email: user.credentials.email, password: user.credentials.password },
  })
  expect(loginWhileBlocked.status).toBe(403)

  await call(context.app, 'PUT', `/admin/users/${user.user.id}/status`, {
    token: admin.accessToken,
    body: { status: 'active' },
  })
  const loginAfterUnblock = await call(context.app, 'POST', '/auth/login', {
    body: { email: user.credentials.email, password: user.credentials.password },
  })
  expect(loginAfterUnblock.status).toBe(200)
})

test('admin views and terminates another user\'s sessions', async () => {
  const admin = await createAdmin()
  const user = await registerUser(context.app)

  const sessions = await call(context.app, 'GET', `/admin/users/${user.user.id}/sessions`, { token: admin.accessToken })
  expect(sessions.status).toBe(200)
  expect(sessions.body).toHaveLength(1)

  const revoked = await call(context.app, 'DELETE', `/admin/sessions/${sessions.body[0].id}`, { token: admin.accessToken })
  expect(revoked.status).toBe(204)
  expect((await call(context.app, 'GET', '/auth/me', { token: user.accessToken })).status).toBe(401)

  const again = await call(context.app, 'DELETE', `/admin/sessions/${sessions.body[0].id}`, { token: admin.accessToken })
  const unknownUser = await call(context.app, 'GET', '/admin/users/00000000-0000-4000-8000-000000000000/sessions', { token: admin.accessToken })
  expect([again.status, unknownUser.status]).toEqual([404, 404])
})
