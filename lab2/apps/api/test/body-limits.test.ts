import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, type TestContext } from './helpers'

let context: TestContext
let port: number

beforeAll(async () => {
  context = await createTestContext()
  await context.app.listen({ host: '127.0.0.1', port: 0 })
  port = (context.app.server.address() as AddressInfo).port
})

afterAll(() => context.close())

function postChunked(path: string, chunks: string[]) {
  return new Promise<number>((resolve, reject) => {
    const outgoing = request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } },
      (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      },
    )
    outgoing.on('error', reject)
    for (const chunk of chunks) outgoing.write(chunk)
    outgoing.end()
  })
}

test('a chunked body without a declared length is refused before it is buffered', async () => {
  const status = await postChunked('/api/auth/login', ['{"email":"a@example.com",', '"password":"password123"}'])
  expect(status).toBe(411)
})

test('a body with a content-length still reaches the handler', async () => {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'nobody@example.com', password: 'password123' },
  })
  expect(response.statusCode).toBe(401)
})
