import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import pino from 'pino'
import { seedAdmin } from '../src/seed-admin'
import { repositoriesFor } from '../src/repositories'
import { createTestContext, testConfig, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

const silentLogger = pino({ level: 'silent' })
const adminConfig = () =>
  testConfig({ admin: { email: 'Admin@Example.com', password: 'Admin12345', name: 'Root' } })

test('seeds an admin account that can log in', async () => {
  await seedAdmin(adminConfig(), repositoriesFor(context.pool).users, silentLogger)
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'admin@example.com', password: 'Admin12345' },
  })
  expect(response.statusCode).toBe(200)
  expect(JSON.parse(response.body).user.role).toBe('admin')
})

test('is idempotent and promotes an existing account with the same email', async () => {
  const { users } = repositoriesFor(context.pool)
  await seedAdmin(adminConfig(), users, silentLogger)
  await context.pool.query("update users set role = 'user'")
  await seedAdmin(adminConfig(), users, silentLogger)
  const rows = await context.pool.query('select role from users')
  expect(rows.rows).toEqual([{ role: 'admin' }])
})

test('does nothing when no admin credentials are configured', async () => {
  await seedAdmin(testConfig({ admin: null }), repositoriesFor(context.pool).users, silentLogger)
  const rows = await context.pool.query('select count(*)::int as count from users')
  expect(rows.rows[0].count).toBe(0)
})
