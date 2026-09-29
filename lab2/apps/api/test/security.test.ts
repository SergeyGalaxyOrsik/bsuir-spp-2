import { expect, test } from 'bun:test'
import { hashPassword, verifyPassword } from '../src/security/password'
import { generateOpaqueToken, hashToken, signAccessToken, verifyAccessToken } from '../src/security/tokens'

const secret = 'x'.repeat(32)

test('password hashes verify only with the right password', async () => {
  const hash = await hashPassword('correct horse')
  expect(hash).not.toContain('correct horse')
  expect(await verifyPassword(hash, 'correct horse')).toBe(true)
  expect(await verifyPassword(hash, 'wrong horse')).toBe(false)
})

test('opaque tokens are unique and hash deterministically', () => {
  const first = generateOpaqueToken()
  expect(first).not.toBe(generateOpaqueToken())
  expect(hashToken(first)).toBe(hashToken(first))
  expect(hashToken(first)).toHaveLength(64)
})

test('access token round-trips its claims', async () => {
  const token = await signAccessToken({ userId: 'u1', role: 'admin', sessionId: 's1' }, secret, 60)
  expect(await verifyAccessToken(token, secret)).toEqual({ userId: 'u1', role: 'admin', sessionId: 's1' })
})

test('access token is rejected when tampered, expired or signed with another secret', async () => {
  const token = await signAccessToken({ userId: 'u1', role: 'user', sessionId: 's1' }, secret, 60)
  await expect(verifyAccessToken(`${token}x`, secret)).rejects.toThrow()
  await expect(verifyAccessToken(token, 'y'.repeat(32))).rejects.toThrow()
  const expired = await signAccessToken({ userId: 'u1', role: 'user', sessionId: 's1' }, secret, -10)
  await expect(verifyAccessToken(expired, secret)).rejects.toThrow()
})

test('garbage is rejected without throwing anything but an error', async () => {
  await expect(verifyAccessToken('not-a-jwt', secret)).rejects.toThrow()
})
