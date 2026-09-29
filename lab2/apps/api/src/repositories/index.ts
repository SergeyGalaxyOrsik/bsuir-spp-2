import type { Pool } from 'pg'
import { createPromptsRepository } from './prompts'
import { createResetTokensRepository } from './reset-tokens'
import { createSessionsRepository } from './sessions'
import { createUsersRepository } from './users'

export function repositoriesFor(pool: Pool) {
  return {
    users: createUsersRepository(pool),
    sessions: createSessionsRepository(pool),
    resetTokens: createResetTokensRepository(pool),
    prompts: createPromptsRepository(pool),
  }
}
