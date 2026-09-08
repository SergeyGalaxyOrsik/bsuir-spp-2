import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Корень пакета backend (на уровень выше src/ или dist/). */
export const rootDir = path.resolve(here, '..')

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 4001),
  /** Публичный адрес самого API — нужен для сборки ссылок на файлы. */
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${Number(process.env.PORT ?? 4001)}`,
  /** Адрес фронтенда: только на него разрешено редиректить после отправки формы. */
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4000',
  dataFile: process.env.DATA_FILE ?? path.join(rootDir, 'data', 'db.json'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(rootDir, 'uploads'),
  /** 10 МБ на файл, не более 5 файлов за одну отправку формы. */
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 5,
}
