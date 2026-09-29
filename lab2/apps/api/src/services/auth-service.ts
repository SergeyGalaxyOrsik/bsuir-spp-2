import type { FastifyBaseLogger } from 'fastify'
import type { Services } from '../context'
import { conflict, forbidden, tooManyRequests, unauthorized } from '../errors'
import type { UserRecord } from '../repositories/users'
import { hashPassword, verifyPassword } from '../security/password'
import { generateOpaqueToken, hashToken } from '../security/tokens'

export type ClientMeta = { ip: string; userAgent: string; log: FastifyBaseLogger }
export type AuthGrant = { user: UserRecord; sessionId: string; refreshToken: string }

const MAX_USER_AGENT_LENGTH = 255

let dummyHashPromise: Promise<string> | undefined
const dummyHash = () => (dummyHashPromise ??= hashPassword('timing-equalizer-password'))

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000)
const secondsUntil = (date: Date) => Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000))
const invalidCredentials = () => unauthorized('Invalid email or password')
const lockedOut = (lockedUntil: Date) =>
  tooManyRequests('Too many failed attempts. Try again later', secondsUntil(lockedUntil))

export function createAuthService({ config, users, sessions }: Pick<Services, 'config' | 'users' | 'sessions'>) {
  async function openSession(user: UserRecord, meta: ClientMeta): Promise<AuthGrant> {
    const refreshToken = generateOpaqueToken()
    const session = await sessions.create({
      userId: user.id,
      refreshHash: hashToken(refreshToken),
      userAgent: meta.userAgent.slice(0, MAX_USER_AGENT_LENGTH),
      ip: meta.ip,
      expiresAt: addSeconds(new Date(), config.refreshTokenTtlSeconds),
    })
    await sessions.revokeOldestBeyond(user.id, config.maxActiveSessions)
    return { user, sessionId: session.id, refreshToken }
  }

  async function rejectFailedLogin(user: UserRecord, meta: ClientMeta): Promise<never> {
    const updated = await users.recordFailedLogin(user.id, config.lockout.maxFailures, config.lockout.durationSeconds)
    meta.log.warn(
      { event: 'auth.login.failed', userId: user.id, failedLoginCount: updated.failedLoginCount },
      'login failed',
    )
    if (updated.lockedUntil && updated.lockedUntil > new Date()) {
      meta.log.warn({ event: 'auth.lockout', userId: user.id }, 'account locked after repeated failures')
      throw lockedOut(updated.lockedUntil)
    }
    throw invalidCredentials()
  }

  async function rejectUnknownRefreshToken(refreshHash: string, meta: ClientMeta): Promise<never> {
    const reusedSession = await sessions.findByPreviousRefreshHash(refreshHash)
    const rotatedRecently =
      reusedSession?.rotatedAt &&
      Date.now() - reusedSession.rotatedAt.getTime() < config.refreshRotationGraceSeconds * 1000
    if (reusedSession && !rotatedRecently) {
      await sessions.revokeAllForUser(reusedSession.userId)
      meta.log.warn(
        { event: 'auth.refresh.reuse_detected', userId: reusedSession.userId, sessionId: reusedSession.id },
        'refresh token reuse detected, all sessions revoked',
      )
    }
    throw unauthorized('Refresh token is invalid')
  }

  return {
    async register(input: { email: string; name: string; password: string }, meta: ClientMeta) {
      const user = await users.create({
        email: normalizeEmail(input.email),
        name: input.name,
        passwordHash: await hashPassword(input.password),
      })
      if (!user) throw conflict('An account with this email already exists')
      meta.log.info({ event: 'auth.register', userId: user.id }, 'user registered')
      return openSession(user, meta)
    },

    async login(input: { email: string; password: string }, meta: ClientMeta) {
      const user = await users.findByEmail(normalizeEmail(input.email))
      if (!user) {
        await verifyPassword(await dummyHash(), input.password)
        meta.log.warn({ event: 'auth.login.failed' }, 'login failed for unknown email')
        throw invalidCredentials()
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) throw lockedOut(user.lockedUntil)
      if (user.lockedUntil) await users.resetLoginFailures(user.id)

      if (!(await verifyPassword(user.passwordHash, input.password))) return rejectFailedLogin(user, meta)
      if (user.status === 'blocked') throw forbidden('This account is blocked')

      await users.resetLoginFailures(user.id)
      meta.log.info({ event: 'auth.login.success', userId: user.id }, 'login succeeded')
      return openSession(user, meta)
    },

    async refresh(refreshToken: string | undefined, meta: ClientMeta): Promise<AuthGrant> {
      if (!refreshToken) throw unauthorized('Refresh token is missing')
      const currentHash = hashToken(refreshToken)
      const session = await sessions.findByRefreshHash(currentHash)
      if (!session) return rejectUnknownRefreshToken(currentHash, meta)
      if (session.revokedAt || session.expiresAt <= new Date()) throw unauthorized('Session has expired')

      const user = await users.findById(session.userId)
      if (!user || user.status === 'blocked') throw unauthorized('Session is no longer active')

      const nextToken = generateOpaqueToken()
      const rotated = await sessions.rotate(
        session.id,
        currentHash,
        hashToken(nextToken),
        addSeconds(new Date(), config.refreshTokenTtlSeconds),
      )
      if (!rotated) throw unauthorized('Refresh token is invalid')
      return { user, sessionId: session.id, refreshToken: nextToken }
    },

    async logoutByRefreshToken(refreshToken: string | undefined) {
      if (!refreshToken) return
      const session = await sessions.findByRefreshHash(hashToken(refreshToken))
      if (session) await sessions.revoke(session.id)
    },

    logoutAll(userId: string) {
      return sessions.revokeAllForUser(userId)
    },
  }
}
