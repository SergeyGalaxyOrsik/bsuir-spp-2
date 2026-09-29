import type { FastifyBaseLogger } from 'fastify'
import type { Config } from './config'
import type { UsersRepository } from './repositories/users'
import { hashPassword } from './security/password'
import { normalizeEmail } from './services/auth-service'

export async function seedAdmin(config: Config, users: UsersRepository, log: FastifyBaseLogger) {
  if (!config.admin) return
  const email = normalizeEmail(config.admin.email)
  const existing = await users.findByEmail(email)
  if (existing) {
    if (existing.role !== 'admin') await users.updateRole(existing.id, 'admin')
    return
  }
  await users.create({
    email,
    name: config.admin.name,
    passwordHash: await hashPassword(config.admin.password),
    role: 'admin',
  })
  log.info({ event: 'admin.seeded', email }, 'admin account created')
}
