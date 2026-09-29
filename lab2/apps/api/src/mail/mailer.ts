import { createTransport } from 'nodemailer'
import type { Config } from '../config'
import { buildPasswordResetEmail } from './reset-email'

export interface Mailer {
  sendPasswordReset(input: { to: string; resetLink: string }): Promise<void>
}

export class SmtpMailer implements Mailer {
  private readonly transport
  private readonly from: string

  constructor(smtp: Config['smtp']) {
    this.transport = createTransport({ host: smtp.host, port: smtp.port, secure: false })
    this.from = smtp.from
  }

  async sendPasswordReset({ to, resetLink }: { to: string; resetLink: string }) {
    await this.transport.sendMail({ from: this.from, to, ...buildPasswordResetEmail(resetLink) })
  }
}
