import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { repositoriesFor } from '../src/repositories'
import { createTestContext, type TestContext } from './helpers'

let context: TestContext
let repositories: ReturnType<typeof repositoriesFor>

beforeAll(async () => {
  context = await createTestContext()
  repositories = repositoriesFor(context.pool)
})

beforeEach(() => context.reset())

afterAll(() => context.close())

async function createUser(email = 'a@example.com') {
  const user = await repositories.users.create({ email, name: 'Alice', passwordHash: 'hash' })
  if (!user) throw new Error('user not created')
  return user
}

test('users: duplicate email returns null instead of throwing', async () => {
  await createUser()
  expect(await repositories.users.create({ email: 'a@example.com', name: 'Bob', passwordHash: 'h' })).toBeNull()
})

test('users: failed logins lock the account once the threshold is reached', async () => {
  const user = await createUser()
  let updated = user
  for (let attempt = 0; attempt < 5; attempt++) {
    updated = await repositories.users.recordFailedLogin(user.id, 5, 900)
  }
  expect(updated.failedLoginCount).toBe(5)
  expect(updated.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
  await repositories.users.resetLoginFailures(user.id)
  const reset = await repositories.users.findById(user.id)
  expect(reset!.failedLoginCount).toBe(0)
  expect(reset!.lockedUntil).toBeNull()
})

test('sessions: rotate keeps the previous hash and revokeOldestBeyond keeps the newest', async () => {
  const user = await createUser()
  const expiresAt = new Date(Date.now() + 60_000)
  const created = []
  for (let index = 0; index < 4; index++) {
    created.push(
      await repositories.sessions.create({ userId: user.id, refreshHash: `hash-${index}`, userAgent: 'ua', ip: '1.1.1.1', expiresAt }),
    )
  }
  await repositories.sessions.revokeOldestBeyond(user.id, 2)
  const active = await repositories.sessions.listActiveByUser(user.id)
  expect(active.map((session) => session.refreshHash).sort()).toEqual(['hash-2', 'hash-3'])

  expect(await repositories.sessions.rotate(created[3]!.id, 'hash-3', 'hash-3-new', expiresAt)).toBe(true)
  expect(await repositories.sessions.rotate(created[3]!.id, 'hash-3', 'hash-3-other', expiresAt)).toBe(false)
  const rotated = await repositories.sessions.findById(created[3]!.id)
  expect(rotated!.refreshHash).toBe('hash-3-new')
  expect(rotated!.previousRefreshHash).toBe('hash-3')
  expect((await repositories.sessions.findByPreviousRefreshHash('hash-3'))!.id).toBe(created[3]!.id)
})

test('reset tokens can be consumed exactly once and never after expiry', async () => {
  const user = await createUser()
  await repositories.resetTokens.create({ userId: user.id, tokenHash: 'fresh', expiresAt: new Date(Date.now() + 60_000) })
  await repositories.resetTokens.create({ userId: user.id, tokenHash: 'stale', expiresAt: new Date(Date.now() - 1000) })
  expect(await repositories.resetTokens.consume('fresh')).toBe(user.id)
  expect(await repositories.resetTokens.consume('fresh')).toBeNull()
  expect(await repositories.resetTokens.consume('stale')).toBeNull()
  expect(await repositories.resetTokens.consume('unknown')).toBeNull()
})

test('prompts: create, list filters, update, attachment and removal', async () => {
  const author = await createUser()
  const other = await createUser('b@example.com')
  const first = await repositories.prompts.create({ authorId: author.id, title: 'Summarize', body: 'Summarize text', model: 'gpt', tags: ['text'] })
  await repositories.prompts.create({ authorId: other.id, title: 'Draw', body: 'Draw a cat', model: 'gemini', tags: [] })

  expect((await repositories.prompts.list({ page: 1, limit: 10 })).total).toBe(2)
  expect((await repositories.prompts.list({ page: 1, limit: 10, search: 'summar' })).items).toHaveLength(1)
  expect((await repositories.prompts.list({ page: 1, limit: 10, model: 'gemini' })).items[0]!.title).toBe('Draw')
  expect((await repositories.prompts.list({ page: 1, limit: 10, authorId: author.id })).items).toHaveLength(1)

  const updated = await repositories.prompts.update(first.id, { title: 'Summarize v2', body: 'b', model: 'claude', tags: ['x', 'y'] })
  expect(updated!.title).toBe('Summarize v2')
  expect(updated!.tags).toEqual(['x', 'y'])

  await repositories.prompts.setAttachment(first.id, { path: 'p', name: 'n.png', mime: 'image/png', size: 3 })
  expect((await repositories.prompts.findById(first.id))!.attachment!.name).toBe('n.png')
  await repositories.prompts.setAttachment(first.id, null)
  expect((await repositories.prompts.findById(first.id))!.attachment).toBeNull()

  expect(await repositories.prompts.remove(first.id)).not.toBeNull()
  expect(await repositories.prompts.findById(first.id)).toBeNull()
  expect(await repositories.prompts.remove(first.id)).toBeNull()
})

test('list escapes LIKE wildcards in the search term', async () => {
  const author = await createUser()
  await repositories.prompts.create({ authorId: author.id, title: '100% real', body: 'b', model: 'other', tags: [] })
  await repositories.prompts.create({ authorId: author.id, title: 'plain', body: 'b', model: 'other', tags: [] })
  expect((await repositories.prompts.list({ page: 1, limit: 10, search: '%' })).items).toHaveLength(1)
})
