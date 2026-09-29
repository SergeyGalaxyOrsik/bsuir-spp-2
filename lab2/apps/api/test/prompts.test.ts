import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { attachmentRules } from '@lab2/contract'
import { call, createTestContext, multipart, promoteUser, registerUser, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

beforeEach(() => context.reset())

afterAll(() => context.close())

const validPrompt = { title: 'Summarize', body: 'Summarize the text', model: 'gpt', tags: ['text'] }

async function createPrompt(token: string, overrides: Record<string, unknown> = {}) {
  const response = await call(context.app, 'POST', '/prompts', { token, body: { ...validPrompt, ...overrides } })
  return response.body as { id: string; title: string; author: { id: string; name: string } }
}

async function createWithFile(token: string, file: File, fields: Record<string, string> = {}) {
  const { payload, contentType } = await multipart({
    title: 'With file',
    body: 'Prompt body',
    model: 'claude',
    'tags[0]': 'a',
    'tags[1]': 'b',
    ...fields,
    file,
  })
  return call(context.app, 'POST', '/prompts', { token, payload, contentType })
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

test('every prompt endpoint requires authentication', async () => {
  const list = await call(context.app, 'GET', '/prompts')
  const create = await call(context.app, 'POST', '/prompts', { body: validPrompt })
  expect([list.status, create.status]).toEqual([401, 401])
})

test('create takes the author from the token and ignores an authorId in the body', async () => {
  const alice = await registerUser(context.app, { name: 'Alice' })
  const bob = await registerUser(context.app, { name: 'Bob' })
  const response = await call(context.app, 'POST', '/prompts', {
    token: alice.accessToken,
    body: { ...validPrompt, authorId: bob.user.id },
  })
  expect(response.status).toBe(201)
  expect(response.body.author).toEqual({ id: alice.user.id, name: 'Alice' })
  expect(response.body.attachment).toBeNull()
})

test('create validates every field and reports which failed', async () => {
  const { accessToken } = await registerUser(context.app)
  const response = await call(context.app, 'POST', '/prompts', {
    token: accessToken,
    body: { title: '', body: '', model: 'llama', tags: Array.from({ length: 11 }, (_, index) => `t${index}`) },
  })
  expect(response.status).toBe(400)
  const failedFields = new Set(response.body.data.issues.map((issue: { path: string[] }) => issue.path[0]))
  expect([...failedFields].sort()).toEqual(['body', 'model', 'tags', 'title'])
})

test('multipart create stores the attachment and parses array fields', async () => {
  const { accessToken } = await registerUser(context.app)
  const response = await createWithFile(accessToken, png())
  expect(response.status).toBe(201)
  expect(response.body.tags).toEqual(['a', 'b'])
  expect(response.body.attachment).toEqual({ name: 'shot.png', mime: 'image/png', size: 4 })
  expect(context.storage.files.size).toBe(1)
})

test('a markdown file with an empty browser mime type is accepted as text/markdown', async () => {
  const { accessToken } = await registerUser(context.app)
  const response = await createWithFile(accessToken, new File(['# Notes'], 'notes.md', { type: '' }))
  expect(response.status).toBe(201)
  expect(response.body.attachment.mime).toBe('text/markdown')
})

test('a disallowed file type gets 415 and nothing is stored or created', async () => {
  const { accessToken } = await registerUser(context.app)
  const response = await createWithFile(accessToken, new File(['zip'], 'archive.zip', { type: 'application/zip' }))
  expect(response.status).toBe(415)
  expect(context.storage.files.size).toBe(0)
  const list = await call(context.app, 'GET', '/prompts', { token: accessToken })
  expect(list.body.total).toBe(0)
})

test('a file over 5 MB gets 413 and nothing is stored', async () => {
  const { accessToken } = await registerUser(context.app)
  const large = new File([new Uint8Array(attachmentRules.maxBytes + 1)], 'big.pdf', { type: 'application/pdf' })
  const response = await createWithFile(accessToken, large)
  expect(response.status).toBe(413)
  expect(context.storage.files.size).toBe(0)
})

test('a request body far beyond the limit is rejected early with 413', async () => {
  const { accessToken } = await registerUser(context.app)
  const huge = new File([new Uint8Array(attachmentRules.maxBytes * 2)], 'huge.pdf', { type: 'application/pdf' })
  const response = await createWithFile(accessToken, huge)
  expect(response.status).toBe(413)
  expect(context.storage.files.size).toBe(0)
})

test('get returns a prompt, 404 for unknown and 400 for a malformed id', async () => {
  const { accessToken } = await registerUser(context.app)
  const created = await createPrompt(accessToken)
  const found = await call(context.app, 'GET', `/prompts/${created.id}`, { token: accessToken })
  const unknown = await call(context.app, 'GET', '/prompts/00000000-0000-4000-8000-000000000000', { token: accessToken })
  const malformed = await call(context.app, 'GET', '/prompts/abc', { token: accessToken })
  expect([found.status, unknown.status, malformed.status]).toEqual([200, 404, 400])
})

test('everyone sees all prompts; the mine filter narrows to own ones', async () => {
  const alice = await registerUser(context.app)
  const bob = await registerUser(context.app)
  await createPrompt(alice.accessToken, { title: 'Alice prompt' })
  await createPrompt(bob.accessToken, { title: 'Bob prompt' })

  const all = await call(context.app, 'GET', '/prompts', { token: alice.accessToken })
  const mine = await call(context.app, 'GET', '/prompts?mine=true', { token: alice.accessToken })
  expect(all.body.total).toBe(2)
  expect(mine.body.items.map((item: { title: string }) => item.title)).toEqual(['Alice prompt'])
})

test('list supports search, model filter and pagination, and rejects bad paging', async () => {
  const { accessToken } = await registerUser(context.app)
  for (let index = 0; index < 5; index++) await createPrompt(accessToken, { title: `Prompt ${index}`, model: index % 2 ? 'claude' : 'gpt' })

  const search = await call(context.app, 'GET', '/prompts?search=prompt%203', { token: accessToken })
  const model = await call(context.app, 'GET', '/prompts?model=claude', { token: accessToken })
  const page = await call(context.app, 'GET', '/prompts?limit=2&page=3', { token: accessToken })
  const badLimit = await call(context.app, 'GET', '/prompts?limit=1000', { token: accessToken })
  expect(search.body.items).toHaveLength(1)
  expect(model.body.total).toBe(2)
  expect(page.body.items).toHaveLength(1)
  expect(page.body.total).toBe(5)
  expect(badLimit.status).toBe(400)
})

test('author updates a prompt; without a file the attachment is kept', async () => {
  const { accessToken } = await registerUser(context.app)
  const created = await createWithFile(accessToken, png())
  const response = await call(context.app, 'PUT', `/prompts/${created.body.id}`, {
    token: accessToken,
    body: { title: 'Renamed', body: 'New body', model: 'gemini', tags: [] },
  })
  expect(response.status).toBe(200)
  expect(response.body.title).toBe('Renamed')
  expect(response.body.attachment.name).toBe('shot.png')
  expect(context.storage.files.size).toBe(1)
})

test('updating with a new file replaces the old one on disk', async () => {
  const { accessToken } = await registerUser(context.app)
  const created = await createWithFile(accessToken, png())
  const { payload, contentType } = await multipart({
    title: 'T',
    body: 'B',
    model: 'gpt',
    file: new File(['hello'], 'hello.txt', { type: 'text/plain' }),
  })
  const response = await call(context.app, 'PUT', `/prompts/${created.body.id}`, { token: accessToken, payload, contentType })
  expect(response.status).toBe(200)
  expect(response.body.attachment.name).toBe('hello.txt')
  expect(context.storage.files.size).toBe(1)
})

test('a user cannot update or delete someone else\'s prompt (403), a moderator can', async () => {
  const author = await registerUser(context.app)
  const stranger = await registerUser(context.app)
  const moderator = await registerUser(context.app)
  await promoteUser(context.pool, moderator.user.id, 'moderator')
  const created = await createPrompt(author.accessToken)
  const update = { title: 'Hijacked', body: 'B', model: 'gpt', tags: [] }

  const foreignUpdate = await call(context.app, 'PUT', `/prompts/${created.id}`, { token: stranger.accessToken, body: update })
  const foreignDelete = await call(context.app, 'DELETE', `/prompts/${created.id}`, { token: stranger.accessToken })
  const moderatorUpdate = await call(context.app, 'PUT', `/prompts/${created.id}`, { token: moderator.accessToken, body: update })
  expect([foreignUpdate.status, foreignDelete.status, moderatorUpdate.status]).toEqual([403, 403, 200])
  expect(moderatorUpdate.body.author.id).toBe(author.user.id)
})

test('update and delete give 404 for unknown prompts and 400 for malformed ids', async () => {
  const { accessToken } = await registerUser(context.app)
  const unknownId = '00000000-0000-4000-8000-000000000000'
  const update = { title: 'T', body: 'B', model: 'gpt', tags: [] }
  const responses = [
    await call(context.app, 'PUT', `/prompts/${unknownId}`, { token: accessToken, body: update }),
    await call(context.app, 'DELETE', `/prompts/${unknownId}`, { token: accessToken }),
    await call(context.app, 'PUT', '/prompts/abc', { token: accessToken, body: update }),
    await call(context.app, 'DELETE', '/prompts/abc', { token: accessToken }),
  ]
  expect(responses.map((response) => response.status)).toEqual([404, 404, 400, 400])
})

test('delete removes the prompt and its file; a second delete is 404', async () => {
  const { accessToken } = await registerUser(context.app)
  const created = await createWithFile(accessToken, png())
  const first = await call(context.app, 'DELETE', `/prompts/${created.body.id}`, { token: accessToken })
  const second = await call(context.app, 'DELETE', `/prompts/${created.body.id}`, { token: accessToken })
  expect([first.status, second.status]).toEqual([204, 404])
  expect(context.storage.files.size).toBe(0)
})

test('any authenticated user downloads an attachment with its original name and type', async () => {
  const author = await registerUser(context.app)
  const reader = await registerUser(context.app)
  const created = await createWithFile(author.accessToken, png())
  const response = await call(context.app, 'GET', `/prompts/${created.body.id}/attachment`, { token: reader.accessToken })
  expect(response.status).toBe(200)
  expect(response.headers['content-type']).toContain('image/png')
  expect(response.headers['content-disposition']).toContain('shot.png')
  expect([...response.rawBody]).toEqual([137, 80, 78, 71])
})

test('downloading when there is no attachment gives 404', async () => {
  const { accessToken } = await registerUser(context.app)
  const created = await createPrompt(accessToken)
  const response = await call(context.app, 'GET', `/prompts/${created.id}/attachment`, { token: accessToken })
  expect(response.status).toBe(404)
})

test('only the author or a moderator can remove an attachment; the file leaves storage', async () => {
  const author = await registerUser(context.app)
  const stranger = await registerUser(context.app)
  const created = await createWithFile(author.accessToken, png())

  const foreign = await call(context.app, 'DELETE', `/prompts/${created.body.id}/attachment`, { token: stranger.accessToken })
  const own = await call(context.app, 'DELETE', `/prompts/${created.body.id}/attachment`, { token: author.accessToken })
  const repeated = await call(context.app, 'DELETE', `/prompts/${created.body.id}/attachment`, { token: author.accessToken })
  expect([foreign.status, own.status, repeated.status]).toEqual([403, 204, 404])
  expect(context.storage.files.size).toBe(0)
  const prompt = await call(context.app, 'GET', `/prompts/${created.body.id}`, { token: author.accessToken })
  expect(prompt.body.attachment).toBeNull()
})
