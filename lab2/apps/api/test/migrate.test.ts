import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, type TestContext } from './helpers'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(() => context.close())

test('migrations create all tables and are idempotent', async () => {
  const { migrate } = await import('../src/db/migrate')
  await migrate(context.pool, context.config.migrationsDir)
  const tables = await context.pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  )
  const names = tables.rows.map((row) => row.table_name)
  expect(names).toEqual(
    expect.arrayContaining(['users', 'sessions', 'password_reset_tokens', 'prompts', 'schema_migrations']),
  )
})
