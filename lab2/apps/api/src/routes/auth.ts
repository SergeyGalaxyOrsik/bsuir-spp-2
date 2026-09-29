import { ORPCError } from '@orpc/server'
import type { ApiContext } from '../context'
import { authed, base } from '../middleware/auth'
import { REFRESH_COOKIE_NAME } from '../security/cookies'
import { createAuthService, type ClientMeta } from '../services/auth-service'
import { toUserDto } from '../serializers'
import { clearRefreshCookie, respondWithGrant } from './grant-response'

export function clientMetaOf(context: ApiContext): ClientMeta {
  return { ip: context.ip, userAgent: context.userAgent, log: context.log }
}

async function withRetryAfterHeader<Result>(context: ApiContext, operation: () => Promise<Result>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'TOO_MANY_REQUESTS') {
      context.resHeaders?.set('retry-after', String(error.data.retryAfterSeconds))
    }
    throw error
  }
}

const register = base.auth.register.handler(async ({ input, context }) => {
  const grant = await createAuthService(context.services).register(input, clientMetaOf(context))
  return respondWithGrant(context, grant)
})

const login = base.auth.login.handler(({ input, context }) =>
  withRetryAfterHeader(context, async () => {
    const grant = await createAuthService(context.services).login(input, clientMetaOf(context))
    return respondWithGrant(context, grant)
  }),
)

const refresh = base.auth.refresh.handler(async ({ context }) => {
  const grant = await createAuthService(context.services).refresh(
    context.cookies[REFRESH_COOKIE_NAME],
    clientMetaOf(context),
  )
  return respondWithGrant(context, grant)
})

const logout = base.auth.logout.handler(async ({ context }) => {
  await createAuthService(context.services).logoutByRefreshToken(context.cookies[REFRESH_COOKIE_NAME])
  clearRefreshCookie(context)
})

const logoutAll = authed.auth.logoutAll.handler(async ({ context }) => {
  await createAuthService(context.services).logoutAll(context.auth.user.id)
  clearRefreshCookie(context)
})

const me = authed.auth.me.handler(({ context }) => toUserDto(context.auth.user))

export const authRoutes = { register, login, refresh, logout, logoutAll, me }
