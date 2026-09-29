import { notFound } from '../errors'
import { authed } from '../middleware/auth'
import { toSessionDto } from '../serializers'

const list = authed.auth.sessions.list.handler(async ({ context }) => {
  const sessions = await context.services.sessions.listActiveByUser(context.auth.user.id)
  return sessions.map((session) => toSessionDto(session, context.auth.sessionId))
})

const revoke = authed.auth.sessions.revoke.handler(async ({ input, context }) => {
  const session = await context.services.sessions.findById(input.id)
  const ownsActiveSession = session && session.userId === context.auth.user.id && !session.revokedAt
  if (!ownsActiveSession) throw notFound('Session not found')
  await context.services.sessions.revoke(session.id)
})

export const sessionRoutes = { list, revoke }
