import type { Role, UserStatus } from '@lab2/contract'
import type { Pool } from 'pg'

export type UserRecord = {
  id: string
  email: string
  name: string
  passwordHash: string
  role: Role
  status: UserStatus
  failedLoginCount: number
  lockedUntil: Date | null
  createdAt: Date
}

type UserRow = {
  id: string
  email: string
  name: string
  password_hash: string
  role: Role
  status: UserStatus
  failed_login_count: number
  locked_until: Date | null
  created_at: Date
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
  }
}

export function createUsersRepository(pool: Pool) {
  async function findOne(sql: string, values: unknown[]) {
    const result = await pool.query<UserRow>(sql, values)
    return result.rows[0] ? toUserRecord(result.rows[0]) : null
  }

  return {
    async create(input: { email: string; name: string; passwordHash: string; role?: Role }) {
      return findOne(
        `insert into users (email, name, password_hash, role)
         values ($1, $2, $3, coalesce($4::user_role, 'user'))
         on conflict (email) do nothing
         returning *`,
        [input.email, input.name, input.passwordHash, input.role ?? null],
      )
    },

    findByEmail(email: string) {
      return findOne('select * from users where email = $1', [email])
    },

    findById(id: string) {
      return findOne('select * from users where id = $1', [id])
    },

    async list() {
      const result = await pool.query<UserRow>('select * from users order by created_at')
      return result.rows.map(toUserRecord)
    },

    updateRole(id: string, role: Role) {
      return findOne('update users set role = $2 where id = $1 returning *', [id, role])
    },

    updateStatus(id: string, status: UserStatus) {
      return findOne('update users set status = $2 where id = $1 returning *', [id, status])
    },

    async recordFailedLogin(id: string, maxFailures: number, lockSeconds: number) {
      const user = await findOne(
        `update users
         set failed_login_count = failed_login_count + 1,
             locked_until = case
               when failed_login_count + 1 >= $2 then now() + make_interval(secs => $3)
               else locked_until
             end
         where id = $1
         returning *`,
        [id, maxFailures, lockSeconds],
      )
      if (!user) throw new Error('user disappeared during login')
      return user
    },

    async resetLoginFailures(id: string) {
      await pool.query('update users set failed_login_count = 0, locked_until = null where id = $1', [id])
    },

    async updatePasswordHash(id: string, passwordHash: string) {
      await pool.query(
        'update users set password_hash = $2, failed_login_count = 0, locked_until = null where id = $1',
        [id, passwordHash],
      )
    },
  }
}

export type UsersRepository = ReturnType<typeof createUsersRepository>
