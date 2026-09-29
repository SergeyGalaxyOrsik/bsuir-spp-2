import type { FastifyBaseLogger } from 'fastify'
import type { Services } from '../context'
import { badRequest } from '../errors'
import { hashPassword } from '../security/password'
import { generateOpaqueToken, hashToken } from '../security/tokens'
import { normalizeEmail } from './auth-service'

const FORGOT_RESPONSE_MESSAGE = 'If an account with that email exists, a reset link has been sent'
const RESET_RESPONSE_MESSAGE = 'Password has been reset. You can now log in'

export function createPasswordRecoveryService({
  config,
  users,
  sessions,
  resetTokens,
  mailer,
}: Pick<Services, 'config' | 'users' | 'sessions' | 'resetTokens' | 'mailer'>) {
  return {
    async requestReset(email: string, log: FastifyBaseLogger) {
      const user = await users.findByEmail(normalizeEmail(email))
      if (user && user.status === 'active') {
        const token = generateOpaqueToken()
        await resetTokens.create({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + config.passwordResetTtlSeconds * 1000),
        })
        try {
          await mailer.sendPasswordReset({
            to: user.email,
            resetLink: `${config.webUrl}/reset-password?token=${token}`,
          })
          log.info({ event: 'auth.password.reset_requested', userId: user.id }, 'password reset mail sent')
        } catch (error) {
          log.error({ err: error, event: 'auth.password.reset_mail_failed', userId: user.id }, 'password reset mail failed')
        }
      }
      return { message: FORGOT_RESPONSE_MESSAGE }
    },

    async resetPassword(token: string, password: string, log: FastifyBaseLogger) {
      const userId = await resetTokens.consume(hashToken(token))
      if (!userId) throw badRequest('Reset link is invalid or has expired')
      await users.updatePasswordHash(userId, await hashPassword(password))
      await sessions.revokeAllForUser(userId)
      log.info({ event: 'auth.password.reset', userId }, 'password reset completed')
      return { message: RESET_RESPONSE_MESSAGE }
    },
  }
}
