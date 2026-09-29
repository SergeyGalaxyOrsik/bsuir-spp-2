import { afterAll, beforeAll, expect, test } from 'bun:test'
import { call, createTestContext, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext({ rateLimit: { strictMax: 3, globalMax: 100000 } })
})

afterAll(() => context.close())

test('strict endpoints answer 429 with Retry-After after exceeding the per-IP limit', async () => {
  const statuses: number[] = []
  let last
  for (let attempt = 0; attempt < 5; attempt++) {
    last = await call(context.app, 'POST', '/auth/login', {
      body: { email: 'nobody@example.com', password: 'password123' },
    })
    statuses.push(last.status)
  }
  expect(statuses).toEqual([401, 401, 401, 429, 429])
  expect(last!.body.code).toBe('TOO_MANY_REQUESTS')
  expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0)
})

test('the strict limit is tracked per path, not shared with other endpoints', async () => {
  const health = await context.app.inject({ method: 'GET', url: '/health' })
  expect(health.statusCode).toBe(200)
  const register = await call(context.app, 'POST', '/auth/register', {
    body: { email: 'fresh@example.com', name: 'Fresh', password: 'password123' },
  })
  expect(register.status).toBe(201)
})
