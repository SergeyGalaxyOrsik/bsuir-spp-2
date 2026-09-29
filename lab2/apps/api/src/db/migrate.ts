import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Pool } from 'pg'

export async function migrate(pool: Pool, directory: string) {
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  )
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const alreadyApplied = await pool.query('select 1 from schema_migrations where name = $1', [file])
    if (alreadyApplied.rowCount) continue
    await applyMigration(pool, file, await readFile(join(directory, file), 'utf8'))
  }
}

async function applyMigration(pool: Pool, name: string, sql: string) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('insert into schema_migrations (name) values ($1)', [name])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
