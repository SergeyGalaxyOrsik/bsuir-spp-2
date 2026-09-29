import { ORPCError } from '@orpc/client'

export type ErrorDescription = {
  message: string
  fieldErrors: Record<string, string>
  retryAfterSeconds: number | null
  status: number | null
}

type ValidationIssue = { message: string; path?: readonly unknown[] }

const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.'
const SERVER_MESSAGE = 'The server ran into a problem. Please try again later.'
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

function collectFieldErrors(data: unknown) {
  const fieldErrors: Record<string, string> = {}
  const issues = (data as { issues?: ValidationIssue[] } | undefined)?.issues ?? []
  for (const issue of issues) {
    const field = issue.path?.[0]
    if (typeof field === 'string' && !(field in fieldErrors)) fieldErrors[field] = issue.message
  }
  return fieldErrors
}

function formatRetryDelay(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function describeError(error: unknown): ErrorDescription {
  if (error instanceof ORPCError) {
    const fieldErrors = error.status === 400 ? collectFieldErrors(error.data) : {}
    const retryAfterSeconds = (error.data as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? null
    if (error.status >= 500) {
      return { message: SERVER_MESSAGE, fieldErrors, retryAfterSeconds: null, status: error.status }
    }
    const message = retryAfterSeconds ? `${error.message}. Retry in ${formatRetryDelay(retryAfterSeconds)}` : error.message
    return { message, fieldErrors, retryAfterSeconds, status: error.status }
  }
  if (error instanceof TypeError) {
    return { message: NETWORK_MESSAGE, fieldErrors: {}, retryAfterSeconds: null, status: null }
  }
  return { message: FALLBACK_MESSAGE, fieldErrors: {}, retryAfterSeconds: null, status: null }
}

export function isGatewayFailure(response: Response) {
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  return response.status >= 500 && !isJson
}
