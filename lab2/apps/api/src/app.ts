import rateLimit from '@fastify/rate-limit'
import { OpenAPIHandler } from '@orpc/openapi/fastify'
import { ORPCError } from '@orpc/server'
import { ResponseHeadersPlugin } from '@orpc/server/plugins'
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Config } from './config'
import type { ApiContext, RequestLogger, Services } from './context'
import { buildLoggerOptions, registerRequestLogging, requestIdFrom } from './logging'
import { router } from './router'
import { parseCookies } from './security/cookies'

export type AppDependencies = Services

const STRICT_RATE_LIMITED_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password/forgot',
  '/api/auth/password/reset',
])

function pathnameOf(request: FastifyRequest) {
  return request.url.split('?')[0] ?? request.url
}

function isStrictRateLimited(request: FastifyRequest) {
  return request.method === 'POST' && STRICT_RATE_LIMITED_PATHS.has(pathnameOf(request))
}

function createContext(request: FastifyRequest, services: Services): ApiContext {
  return {
    services,
    log: request.log as RequestLogger,
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? '',
    authorization: request.headers.authorization,
    cookies: parseCookies(request.headers.cookie),
  }
}

async function registerRateLimit(app: FastifyInstance, config: Config) {
  await app.register(rateLimit, {
    timeWindow: '1 minute',
    max: (request) => (isStrictRateLimited(request) ? config.rateLimit.strictMax : config.rateLimit.globalMax),
    keyGenerator: (request) =>
      `${request.ip}:${isStrictRateLimited(request) ? pathnameOf(request) : 'global'}`,
    errorResponseBuilder: (_request, context) => {
      const retryAfterSeconds = Math.ceil(context.ttl / 1000)
      return {
        defined: false,
        code: 'TOO_MANY_REQUESTS',
        status: 429,
        statusCode: 429,
        message: `Too many requests. Retry in ${retryAfterSeconds} seconds`,
        data: { retryAfterSeconds },
      }
    },
  })
}

export async function buildApp(services: AppDependencies) {
  const app = Fastify({
    logger: buildLoggerOptions(services.config),
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: requestIdFrom,
    trustProxy: true,
  })

  app.removeAllContentTypeParsers()
  app.addContentTypeParser('*', (_request, _payload, done) => done(null, undefined))

  registerRequestLogging(app)
  await registerRateLimit(app, services.config)

  const handler = new OpenAPIHandler(router, {
    plugins: [new ResponseHeadersPlugin()],
    interceptors: [
      async ({ context, next }) => {
        try {
          return await next()
        } catch (error) {
          const isExpectedClientError = error instanceof ORPCError && error.status < 500
          if (!isExpectedClientError) (context as ApiContext).log.error({ err: error }, 'unhandled procedure error')
          throw error
        }
      },
    ],
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.all('/api/*', async (request, reply) => {
    const { matched } = await handler.handle(request, reply, {
      prefix: '/api',
      context: createContext(request, services),
    })
    if (matched) return reply
    return reply.status(404).send({ defined: false, code: 'NOT_FOUND', status: 404, message: 'Route not found' })
  })

  return app
}
