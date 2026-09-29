import type { Pool } from 'pg'

export function createResetTokensRepository(pool: Pool) {
  return {
    async create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
      await pool.query(
        'insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)',
        [input.userId, input.tokenHash, input.expiresAt],
      )
    },

    async consume(tokenHash: string) {
      const result = await pool.query<{ user_id: string }>(
        `update password_reset_tokens set used_at = now()
         where token_hash = $1 and used_at is null and expires_at > now()
         returning user_id`,
        [tokenHash],
      )
      return result.rows[0]?.user_id ?? null
    },
  }
}

export type ResetTokensRepository = ReturnType<typeof createResetTokensRepository>
