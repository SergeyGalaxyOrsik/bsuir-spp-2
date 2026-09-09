import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'
import { FormError, safeReturnTo } from './lib/forms.js'
import { initStore } from './lib/store.js'
import { taskRoutes } from './routes/tasks.js'

export async function buildServer() {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  })

  await app.register(cors, { origin: true })
  // Формы без файлов: application/x-www-form-urlencoded
  await app.register(formbody)
  // Формы с файлами: multipart/form-data
  await app.register(multipart, {
    limits: { fileSize: config.maxFileSize, files: config.maxFiles },
    throwFileSizeLimit: false,
  })
  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  })

  app.setErrorHandler<FormError | FastifyError>((error, request, reply) => {
    const isFormError = error instanceof FormError
    if (!isFormError) request.log.error(error)

    const message = isFormError ? error.message : 'Внутренняя ошибка сервера'
    const status = isFormError ? 400 : ((error as FastifyError).statusCode ?? 500)

    const wantsJson = (request.headers.accept ?? '').includes('application/json')
    if (wantsJson || request.method === 'GET') {
      return reply.code(status).send({ ok: false, error: message })
    }

    const target = safeReturnTo(request.headers.referer)
    target.searchParams.set('error', message)
    return reply.code(303).redirect(target.toString())
  })

  app.get('/api/health', async () => ({ ok: true, uptime: process.uptime() }))
  await app.register(taskRoutes)

  return app
}

const app = await buildServer()
await initStore()

try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info(`Файлы доступны по ${config.publicUrl}/uploads/`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
