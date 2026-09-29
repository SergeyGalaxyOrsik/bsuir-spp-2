import { expect, test } from 'bun:test'
import { createMailer } from '../src/mail/create-mailer'
import { ResendMailer } from '../src/mail/resend-mailer'
import { SmtpMailer } from '../src/mail/mailer'
import { testConfig } from './helpers'

test('uses Resend when an API key is configured', () => {
  expect(createMailer(testConfig({ resendApiKey: 're_test_key' }))).toBeInstanceOf(ResendMailer)
})

test('falls back to SMTP when no API key is configured', () => {
  expect(createMailer(testConfig({ resendApiKey: null }))).toBeInstanceOf(SmtpMailer)
})

test('an empty RESEND_API_KEY in the environment counts as not configured', async () => {
  const { loadConfig } = await import('../src/config')
  const config = loadConfig({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32), RESEND_API_KEY: '' })
  expect(config.resendApiKey).toBeNull()
})
