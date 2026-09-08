import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import type { Attachment, TaskStatus } from '../types.js'
import { isTaskStatus } from '../types.js'

export interface ParsedForm {
  fields: Record<string, string>
  files: Attachment[]
}

/** Расширение берём из исходного имени, но чистим от всего, кроме букв и цифр. */
function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ''
}

/**
 * Читает тело запроса из формы: multipart/form-data (с файлами)
 * либо application/x-www-form-urlencoded.
 */
export async function parseForm(request: FastifyRequest): Promise<ParsedForm> {
  const fields: Record<string, string> = {}
  const files: Attachment[] = []

  if (!request.isMultipart()) {
    const body = (request.body ?? {}) as Record<string, unknown>
    for (const [key, value] of Object.entries(body)) {
      fields[key] = Array.isArray(value) ? String(value.at(-1)) : String(value)
    }
    return { fields, files }
  }

  for await (const part of request.parts()) {
    if (part.type === 'field') {
      fields[part.fieldname] = String(part.value ?? '')
      continue
    }

    // Пустой input[type=file] всё равно приходит как часть — пропускаем его.
    if (!part.filename) {
      part.file.resume()
      continue
    }

    if (files.length >= config.maxFiles) {
      part.file.resume()
      continue
    }

    const storedName = `${randomUUID()}${safeExtension(part.filename)}`
    const destination = path.join(config.uploadsDir, storedName)
    await pipeline(part.file, createWriteStream(destination))

    if (part.file.truncated) {
      await fs.rm(destination, { force: true })
      throw new FormError(`Файл «${part.filename}» больше ${config.maxFileSize / 1024 / 1024} МБ`)
    }

    const { size } = await fs.stat(destination)
    files.push({
      id: randomUUID(),
      originalName: part.filename,
      storedName,
      mimeType: part.mimetype || 'application/octet-stream',
      size,
      uploadedAt: new Date().toISOString(),
    })
  }

  return { fields, files }
}

export class FormError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormError'
  }
}

export async function removeFiles(files: Attachment[]): Promise<void> {
  await Promise.all(files.map((file) => fs.rm(path.join(config.uploadsDir, file.storedName), { force: true })))
}

/** Разрешаем возврат только на собственный фронтенд — иначе это open redirect. */
export function safeReturnTo(returnTo: string | undefined, fallbackPath = '/'): URL {
  const fallback = new URL(fallbackPath, config.frontendUrl)
  if (!returnTo) return fallback
  try {
    const candidate = new URL(returnTo, config.frontendUrl)
    return candidate.origin === new URL(config.frontendUrl).origin ? candidate : fallback
  } catch {
    return fallback
  }
}

/**
 * Ответ на отправку формы: браузеру — редирект 303 обратно на страницу
 * (шаблон POST/Redirect/GET), программному клиенту — JSON.
 */
export function respondToForm(
  request: FastifyRequest,
  reply: FastifyReply,
  options: { returnTo?: string; fallbackPath?: string; notice?: string; error?: string; payload?: unknown },
): FastifyReply {
  const wantsJson = (request.headers.accept ?? '').includes('application/json')
  if (wantsJson) {
    return reply.code(options.error ? 400 : 200).send({
      ok: !options.error,
      notice: options.notice,
      error: options.error,
      data: options.payload,
    })
  }

  const target = safeReturnTo(options.returnTo, options.fallbackPath)
  if (options.notice) target.searchParams.set('notice', options.notice)
  if (options.error) target.searchParams.set('error', options.error)
  return reply.code(303).redirect(target.toString())
}

export function parseStatus(value: string | undefined, fallback: TaskStatus = 'todo'): TaskStatus {
  return isTaskStatus(value) ? value : fallback
}

/** input[type=date] присылает YYYY-MM-DD либо пустую строку. */
export function parseDueDate(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new FormError('Некорректная дата завершения')
  if (Number.isNaN(Date.parse(trimmed))) throw new FormError('Некорректная дата завершения')
  return trimmed
}

export function parseTitle(value: string | undefined): string {
  const title = (value ?? '').trim()
  if (!title) throw new FormError('Название задачи не может быть пустым')
  if (title.length > 200) throw new FormError('Название задачи длиннее 200 символов')
  return title
}
