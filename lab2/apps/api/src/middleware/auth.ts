import { contract, type Role } from '@lab2/contract'
import { implement } from '@orpc/server'
import type { ApiContext } from '../context'
import { forbidden, unauthorized } from '../errors'
import { verifyAccessToken } from '../security/tokens'

export const base = implement(contract).$context<ApiContext>()

function extractBearerToken(header: string | undefined) {
  const [scheme, token] = (header ?? '').split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

async function authenticateRequest(context: ApiContext) {
  const token = extractBearerToken(context.authorization)
  if (!token) throw unauthorized('Authentication required')

  const claims = await verifyAccessToken(token, context.services.config.jwtSecret).catch(() => null)
  if (!claims) throw unauthorized('Access token is invalid or expired')

  const session = await context.services.sessions.findActiveById(claims.sessionId)
  const user = session ? await context.services.users.findById(session.userId) : null
  if (!session || !user || user.status === 'blocked') throw unauthorized('Session is no longer active')

  context.log.setBindings({ userId: user.id })
  return { user, sessionId: session.id }
}

export function requireRole(...allowedRoles: Role[]) {
  return base.middleware(async ({ context, next }) => {
    const auth = await authenticateRequest(context)
    if (allowedRoles.length > 0 && !allowedRoles.includes(auth.user.role)) {
      throw forbidden('You do not have permission to perform this action')
    }
    return next({ context: { auth } })
  })
}

export const authed = base.use(requireRole())
export const adminOnly = base.use(requireRole('admin'))
