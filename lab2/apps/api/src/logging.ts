import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Config } from './config'

export function buildLoggerOptions(config: Config): FastifyServerOptions['logger'] {
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'newPassword',
        'token',
        'refreshToken',
        '*.password',
        '*.token',
      ],
      censor: '[redacted]',
    },
    transport: config.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined,
  }
}

export function requestIdFrom(request: IncomingMessage) {
  const incoming = request.headers['x-request-id']
  return typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID()
}

export function registerRequestLogging(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    reply.raw.setHeader('x-request-id', request.id)
    const startedAt = process.hrtime.bigint()
    reply.raw.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      request.log.info(
        { method: request.method, path: request.url, status: reply.raw.statusCode, durationMs },
        'request completed',
      )
    })
  })
}
