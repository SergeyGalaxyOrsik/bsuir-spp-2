import type { PromptModel } from '@lab2/contract'
import type { Pool } from 'pg'
import type { StoredFile } from '../storage/file-storage'

export type PromptRecord = {
  id: string
  authorId: string
  authorName: string
  title: string
  body: string
  model: PromptModel
  tags: string[]
  attachment: StoredFile | null
  createdAt: Date
  updatedAt: Date
}

type PromptFields = { title: string; body: string; model: PromptModel; tags: string[] }

type PromptFilters = {
  page: number
  limit: number
  search?: string
  model?: PromptModel
  authorId?: string
}

type PromptRow = {
  id: string
  author_id: string
  author_name: string
  title: string
  body: string
  model: PromptModel
  tags: string[]
  attachment_name: string | null
  attachment_mime: string | null
  attachment_size: number | null
  attachment_path: string | null
  created_at: Date
  updated_at: Date
}

const selectPrompt = `
  select prompts.*, users.name as author_name
  from prompts join users on users.id = prompts.author_id`

function toPromptRecord(row: PromptRow): PromptRecord {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    model: row.model,
    tags: row.tags,
    attachment: row.attachment_path
      ? {
          path: row.attachment_path,
          name: row.attachment_name ?? '',
          mime: row.attachment_mime ?? '',
          size: row.attachment_size ?? 0,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function escapeLikePattern(term: string) {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function createPromptsRepository(pool: Pool) {
  async function findById(id: string) {
    const result = await pool.query<PromptRow>(`${selectPrompt} where prompts.id = $1`, [id])
    return result.rows[0] ? toPromptRecord(result.rows[0]) : null
  }

  return {
    findById,

    async create(input: PromptFields & { authorId: string }) {
      const inserted = await pool.query<{ id: string }>(
        `insert into prompts (author_id, title, body, model, tags)
         values ($1, $2, $3, $4, $5) returning id`,
        [input.authorId, input.title, input.body, input.model, input.tags],
      )
      const record = await findById(inserted.rows[0]!.id)
      if (!record) throw new Error('prompt was not created')
      return record
    },

    async list(filters: PromptFilters) {
      const conditions: string[] = []
      const values: unknown[] = []
      const addCondition = (sql: string, value: unknown) => {
        values.push(value)
        conditions.push(sql.replace('?', `$${values.length}`))
      }
      if (filters.search) {
        values.push(`%${escapeLikePattern(filters.search)}%`)
        const placeholder = `$${values.length}`
        conditions.push(
          `(prompts.title ilike ${placeholder} escape '\\' or prompts.body ilike ${placeholder} escape '\\')`,
        )
      }
      if (filters.model) addCondition('prompts.model = ?', filters.model)
      if (filters.authorId) addCondition('prompts.author_id = ?', filters.authorId)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

      const total = await pool.query<{ count: string }>(`select count(*) from prompts ${where}`, values)
      const rows = await pool.query<PromptRow>(
        `${selectPrompt} ${where} order by prompts.created_at desc limit ${filters.limit} offset ${(filters.page - 1) * filters.limit}`,
        values,
      )
      return { items: rows.rows.map(toPromptRecord), total: Number(total.rows[0]!.count) }
    },

    async update(id: string, fields: PromptFields) {
      const result = await pool.query(
        `update prompts set title = $2, body = $3, model = $4, tags = $5, updated_at = now()
         where id = $1`,
        [id, fields.title, fields.body, fields.model, fields.tags],
      )
      return result.rowCount ? findById(id) : null
    },

    async setAttachment(id: string, file: StoredFile | null) {
      await pool.query(
        `update prompts set attachment_name = $2, attachment_mime = $3, attachment_size = $4,
           attachment_path = $5, updated_at = now() where id = $1`,
        [id, file?.name ?? null, file?.mime ?? null, file?.size ?? null, file?.path ?? null],
      )
    },

    async remove(id: string) {
      const existing = await findById(id)
      if (!existing) return null
      await pool.query('delete from prompts where id = $1', [id])
      return existing
    },
  }
}

export type PromptsRepository = ReturnType<typeof createPromptsRepository>
