import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { roleSchema, type Role } from '@lab2/contract'

export type AccessClaims = { userId: string; role: Role; sessionId: string }

export function generateOpaqueToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function signAccessToken(claims: AccessClaims, secret: string, ttlSeconds: number) {
  return new SignJWT({ role: claims.role, sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(new TextEncoder().encode(secret))
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
  return {
    userId: String(payload.sub),
    role: roleSchema.parse(payload.role),
    sessionId: String(payload.sid),
  }
}
