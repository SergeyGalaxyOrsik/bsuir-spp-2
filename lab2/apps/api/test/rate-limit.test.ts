import { afterAll, beforeAll, expect, test } from 'bun:test'
import { call, createTestContext, type TestContext } from './helpers'

let context: TestContext
let proxied: TestContext

beforeAll(async () => {
  context = await createTestContext({ rateLimit: { strictMax: 3, globalMax: 100000 } })
  proxied = await createTestContext({ rateLimit: { strictMax: 3, globalMax: 100000 }, trustProxy: ['10.0.0.0/8'] })
})

afterAll(async () => {
  await context.close()
  await proxied.close()
})

async function loginAttempts(target: TestContext, forwardedFor: (attempt: number) => string) {
  const statuses: number[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await target.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.0.0.9',
      headers: { 'x-forwarded-for': forwardedFor(attempt) },
      payload: { email: 'nobody@example.com', password: 'password123' },
    })
    statuses.push(response.statusCode)
  }
  return statuses
}

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

test('without a trusted proxy, a spoofed X-Forwarded-For does not evade the limit', async () => {
  const statuses = await loginAttempts(context, (attempt) => `203.0.113.${attempt + 1}`)
  expect(statuses).toEqual([401, 401, 401, 429, 429])
})

test('behind a trusted proxy network, each client address gets its own bucket', async () => {
  const separateClients = await loginAttempts(proxied, (attempt) => `203.0.113.${attempt + 1}`)
  expect(separateClients).toEqual([401, 401, 401, 401, 401])
  const oneClient = await loginAttempts(proxied, () => '198.51.100.7')
  expect(oneClient).toEqual([401, 401, 401, 429, 429])
})
