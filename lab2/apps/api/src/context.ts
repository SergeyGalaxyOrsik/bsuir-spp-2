import type { ResponseHeadersPluginContext } from '@orpc/server/plugins'
import type { FastifyBaseLogger } from 'fastify'
import type { Config } from './config'
import type { Mailer } from './mail/mailer'
import type { FileStorage } from './storage/file-storage'

export type Services = {
  config: Config
  mailer: Mailer
  storage: FileStorage
}

export type RequestContext = ResponseHeadersPluginContext & {
  ip: string
  userAgent: string
  authorization: string | undefined
  cookies: Record<string, string>
  log: FastifyBaseLogger
}

export type ApiContext = RequestContext & { services: Services }
