import { DiskFileStorage } from './storage/file-storage'
import { createMailer } from './mail/create-mailer'
import { buildApp } from './app'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { createPool } from './db/pool'
import { repositoriesFor } from './repositories'
import { seedAdmin } from './seed-admin'

const config = loadConfig(process.env)
const pool = createPool(config.databaseUrl)

await migrate(pool, config.migrationsDir)

const services = {
  config,
  mailer: createMailer(config),
  storage: new DiskFileStorage(config.uploadsDir),
  ...repositoriesFor(pool),
}
const app = await buildApp(services)
await seedAdmin(config, services.users, app.log)

async function shutdown() {
  await app.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

await app.listen({ host: '0.0.0.0', port: config.port })
