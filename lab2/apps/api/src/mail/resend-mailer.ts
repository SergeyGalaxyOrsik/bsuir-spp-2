import type { Mailer } from './mailer'
import { buildPasswordResetEmail } from './reset-email'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

type ResendMailerOptions = { apiKey: string; from: string; fetch?: typeof fetch }

async function describeRejection(response: Response) {
  const body = (await response.json().catch(() => null)) as { message?: string } | null
  const reason = body?.message ? `: ${body.message}` : ''
  return `Resend rejected the email (${response.status})${reason}`
}

export class ResendMailer implements Mailer {
  private readonly apiKey: string
  private readonly from: string
  private readonly send: typeof fetch

  constructor(options: ResendMailerOptions) {
    this.apiKey = options.apiKey
    this.from = options.from
    this.send = options.fetch ?? fetch
  }

  async sendPasswordReset({ to, resetLink }: { to: string; resetLink: string }) {
    const response = await this.send(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], ...buildPasswordResetEmail(resetLink) }),
    })
    if (!response.ok) throw new Error(await describeRejection(response))
  }
}
