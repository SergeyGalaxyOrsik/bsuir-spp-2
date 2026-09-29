import type { Config } from '../config'
import { SmtpMailer, type Mailer } from './mailer'
import { ResendMailer } from './resend-mailer'

export function createMailer(config: Config): Mailer {
  if (config.resendApiKey) return new ResendMailer({ apiKey: config.resendApiKey, from: config.smtp.from })
  return new SmtpMailer(config.smtp)
}
