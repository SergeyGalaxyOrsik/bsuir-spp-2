import { ORPCError } from '@orpc/server'

export const unauthorized = (message: string) => new ORPCError('UNAUTHORIZED', { message })
export const forbidden = (message: string) => new ORPCError('FORBIDDEN', { message })
export const notFound = (message: string) => new ORPCError('NOT_FOUND', { message })
export const conflict = (message: string) => new ORPCError('CONFLICT', { message })
export const badRequest = (message: string, data?: unknown) =>
  new ORPCError('BAD_REQUEST', { message, data })
export const payloadTooLarge = (message: string) => new ORPCError('PAYLOAD_TOO_LARGE', { message })
export const unsupportedMediaType = (message: string) =>
  new ORPCError('UNSUPPORTED_MEDIA_TYPE', { message })
export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new ORPCError('TOO_MANY_REQUESTS', { message, data: { retryAfterSeconds } })
