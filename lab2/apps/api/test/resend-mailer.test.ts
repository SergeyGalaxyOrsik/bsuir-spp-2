import { expect, test } from 'bun:test'
import { ResendMailer } from '../src/mail/resend-mailer'

type RecordedRequest = { url: string; init: RequestInit }

function fakeFetch(response: Response, recorded: RecordedRequest[] = []) {
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    recorded.push({ url: String(url), init: init ?? {} })
    return response
  }
  return { fetchFn: fetchFn as typeof fetch, recorded }
}

test('posts the reset mail to the Resend API with bearer auth', async () => {
  const { fetchFn, recorded } = fakeFetch(Response.json({ id: 'mail_1' }))
  const mailer = new ResendMailer({ apiKey: 'key_123', from: 'Prompt Library <laba@orsik.site>', fetch: fetchFn })

  await mailer.sendPasswordReset({ to: 'user@example.com', resetLink: 'http://localhost:3000/reset-password?token=abc' })

  expect(recorded).toHaveLength(1)
  expect(recorded[0]!.url).toBe('https://api.resend.com/emails')
  expect(recorded[0]!.init.method).toBe('POST')
  const headers = recorded[0]!.init.headers as Record<string, string>
  expect(headers.authorization).toBe('Bearer key_123')
  expect(headers['content-type']).toBe('application/json')
  const body = JSON.parse(String(recorded[0]!.init.body))
  expect(body.from).toBe('Prompt Library <laba@orsik.site>')
  expect(body.to).toEqual(['user@example.com'])
  expect(body.subject).toBe('Reset your Prompt Library password')
  expect(body.text).toContain('http://localhost:3000/reset-password?token=abc')
  expect(body.html).toContain('href="http://localhost:3000/reset-password?token=abc"')
})

test('escapes the link inside the html body', async () => {
  const { fetchFn, recorded } = fakeFetch(Response.json({ id: 'mail_2' }))
  const mailer = new ResendMailer({ apiKey: 'key_123', from: 'a@b.co', fetch: fetchFn })

  await mailer.sendPasswordReset({ to: 'user@example.com', resetLink: 'http://x/?a=1&b="2"' })

  const body = JSON.parse(String(recorded[0]!.init.body))
  expect(body.html).toContain('a=1&amp;b=&quot;2&quot;')
  expect(body.html).not.toContain('b="2"')
})

test('fails with the provider message when Resend rejects the request', async () => {
  const { fetchFn } = fakeFetch(Response.json({ message: 'The orsik.site domain is not verified' }, { status: 403 }))
  const mailer = new ResendMailer({ apiKey: 'key_123', from: 'a@b.co', fetch: fetchFn })

  await expect(mailer.sendPasswordReset({ to: 'user@example.com', resetLink: 'http://x' })).rejects.toThrow(
    'Resend rejected the email (403): The orsik.site domain is not verified',
  )
})

test('fails with a generic message when the error body is not JSON', async () => {
  const { fetchFn } = fakeFetch(new Response('Bad Gateway', { status: 502 }))
  const mailer = new ResendMailer({ apiKey: 'key_123', from: 'a@b.co', fetch: fetchFn })

  await expect(mailer.sendPasswordReset({ to: 'user@example.com', resetLink: 'http://x' })).rejects.toThrow(
    'Resend rejected the email (502)',
  )
})
