import type { ApiContext } from '../context'
import type { AuthGrant } from '../services/auth-service'
import { serializeClearedRefreshCookie, serializeRefreshCookie } from '../security/cookies'
import { signAccessToken } from '../security/tokens'
import { toUserDto } from '../serializers'

export async function respondWithGrant(context: ApiContext, grant: AuthGrant) {
  const { config } = context.services
  const accessToken = await signAccessToken(
    { userId: grant.user.id, role: grant.user.role, sessionId: grant.sessionId },
    config.jwtSecret,
    config.accessTokenTtlSeconds,
  )
  context.resHeaders?.append(
    'set-cookie',
    serializeRefreshCookie(grant.refreshToken, config.refreshTokenTtlSeconds, config.cookieSecure),
  )
  return { accessToken, user: toUserDto(grant.user) }
}

export function clearRefreshCookie(context: ApiContext) {
  context.resHeaders?.append('set-cookie', serializeClearedRefreshCookie(context.services.config.cookieSecure))
}
