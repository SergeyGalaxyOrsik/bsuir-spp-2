import type { Pool } from 'pg'

export type SessionRecord = {
  id: string
  userId: string
  refreshHash: string
  previousRefreshHash: string | null
  rotatedAt: Date | null
  userAgent: string
  ip: string
  createdAt: Date
  lastUsedAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

type SessionRow = {
  id: string
  user_id: string
  refresh_hash: string
  previous_refresh_hash: string | null
  rotated_at: Date | null
  user_agent: string
  ip: string
  created_at: Date
  last_used_at: Date
  expires_at: Date
  revoked_at: Date | null
}

function toSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    refreshHash: row.refresh_hash,
    previousRefreshHash: row.previous_refresh_hash,
    rotatedAt: row.rotated_at,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }
}

export function createSessionsRepository(pool: Pool) {
  async function findOne(sql: string, values: unknown[]) {
    const result = await pool.query<SessionRow>(sql, values)
    return result.rows[0] ? toSessionRecord(result.rows[0]) : null
  }

  return {
    async create(input: { userId: string; refreshHash: string; userAgent: string; ip: string; expiresAt: Date }) {
      const session = await findOne(
        `insert into sessions (user_id, refresh_hash, user_agent, ip, expires_at)
         values ($1, $2, $3, $4, $5) returning *`,
        [input.userId, input.refreshHash, input.userAgent, input.ip, input.expiresAt],
      )
      if (!session) throw new Error('session was not created')
      return session
    },

    findById(id: string) {
      return findOne('select * from sessions where id = $1', [id])
    },

    findActiveById(id: string) {
      return findOne('select * from sessions where id = $1 and revoked_at is null and expires_at > now()', [id])
    },

    findByRefreshHash(refreshHash: string) {
      return findOne('select * from sessions where refresh_hash = $1', [refreshHash])
    },

    findByPreviousRefreshHash(refreshHash: string) {
      return findOne('select * from sessions where previous_refresh_hash = $1', [refreshHash])
    },

    async rotate(id: string, expectedRefreshHash: string, newRefreshHash: string, expiresAt: Date) {
      const result = await pool.query(
        `update sessions
         set previous_refresh_hash = refresh_hash, refresh_hash = $3, rotated_at = now(),
             last_used_at = now(), expires_at = $4
         where id = $1 and refresh_hash = $2 and revoked_at is null`,
        [id, expectedRefreshHash, newRefreshHash, expiresAt],
      )
      return (result.rowCount ?? 0) > 0
    },

    async listActiveByUser(userId: string) {
      const result = await pool.query<SessionRow>(
        `select * from sessions
         where user_id = $1 and revoked_at is null and expires_at > now()
         order by created_at desc`,
        [userId],
      )
      return result.rows.map(toSessionRecord)
    },

    async revoke(id: string) {
      await pool.query('update sessions set revoked_at = now() where id = $1 and revoked_at is null', [id])
    },

    async revokeAllForUser(userId: string) {
      await pool.query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId])
    },

    async revokeOldestBeyond(userId: string, keep: number) {
      await pool.query(
        `update sessions set revoked_at = now()
         where id in (
           select id from sessions
           where user_id = $1 and revoked_at is null and expires_at > now()
           order by created_at desc
           offset $2
         )`,
        [userId, keep],
      )
    },
  }
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>
