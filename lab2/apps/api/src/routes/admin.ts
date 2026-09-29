import { badRequest, notFound } from '../errors'
import { adminOnly } from '../middleware/auth'
import { toSessionDto, toUserDto } from '../serializers'

const list = adminOnly.admin.users.list.handler(async ({ context }) => {
  const users = await context.services.users.list()
  return users.map(toUserDto)
})

const updateRole = adminOnly.admin.users.updateRole.handler(async ({ input, context }) => {
  if (input.id === context.auth.user.id) throw badRequest('You cannot change your own role')
  const user = await context.services.users.updateRole(input.id, input.role)
  if (!user) throw notFound('User not found')
  context.log.info(
    { event: 'admin.role_changed', actorId: context.auth.user.id, targetId: user.id, role: user.role },
    'user role changed',
  )
  return toUserDto(user)
})

const updateStatus = adminOnly.admin.users.updateStatus.handler(async ({ input, context }) => {
  if (input.id === context.auth.user.id) throw badRequest('You cannot change your own status')
  const user = await context.services.users.updateStatus(input.id, input.status)
  if (!user) throw notFound('User not found')
  if (user.status === 'blocked') await context.services.sessions.revokeAllForUser(user.id)
  context.log.info(
    { event: 'admin.user_status_changed', actorId: context.auth.user.id, targetId: user.id, status: user.status },
    'user status changed',
  )
  return toUserDto(user)
})

const userSessions = adminOnly.admin.users.sessions.handler(async ({ input, context }) => {
  const user = await context.services.users.findById(input.id)
  if (!user) throw notFound('User not found')
  const sessions = await context.services.sessions.listActiveByUser(user.id)
  return sessions.map((session) => toSessionDto(session, null))
})

const revokeSession = adminOnly.admin.sessions.revoke.handler(async ({ input, context }) => {
  const session = await context.services.sessions.findById(input.id)
  if (!session || session.revokedAt) throw notFound('Session not found')
  await context.services.sessions.revoke(session.id)
  context.log.info(
    { event: 'admin.session_revoked', actorId: context.auth.user.id, targetId: session.userId, sessionId: session.id },
    'session revoked by admin',
  )
})

export const adminRoutes = {
  users: { list, updateRole, updateStatus, sessions: userSessions },
  sessions: { revoke: revokeSession },
}
