import { afterAll, beforeAll, expect, test } from 'bun:test'
import { call, createTestContext, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(() => context.close())

test('health endpoint responds ok', async () => {
  const response = await context.app.inject({ method: 'GET', url: '/health' })
  expect(response.statusCode).toBe(200)
  expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
})

test('unknown api route returns a 404 error body', async () => {
  const response = await call(context.app, 'GET', '/does-not-exist')
  expect(response.status).toBe(404)
  expect(response.body.code).toBe('NOT_FOUND')
})

test('every response carries an x-request-id header, echoing a valid incoming one', async () => {
  const generated = await context.app.inject({ method: 'GET', url: '/health' })
  expect(generated.headers['x-request-id']).toBeTruthy()

  const echoed = await context.app.inject({
    method: 'GET',
    url: '/health',
    headers: { 'x-request-id': 'abc-123' },
  })
  expect(echoed.headers['x-request-id']).toBe('abc-123')
})
