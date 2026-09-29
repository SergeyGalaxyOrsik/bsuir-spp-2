import { oc } from '@orpc/contract'
import { z } from 'zod'
import { roleSchema, sessionSchema, userSchema, userStatusSchema } from './schemas'

const listUsers = oc
  .route({ method: 'GET', path: '/admin/users', tags: ['admin'] })
  .output(z.array(userSchema))

const updateRole = oc
  .route({ method: 'PUT', path: '/admin/users/{id}/role', tags: ['admin'] })
  .input(z.object({ id: z.uuid(), role: roleSchema }))
  .output(userSchema)

const updateStatus = oc
  .route({ method: 'PUT', path: '/admin/users/{id}/status', tags: ['admin'] })
  .input(z.object({ id: z.uuid(), status: userStatusSchema }))
  .output(userSchema)

const userSessions = oc
  .route({ method: 'GET', path: '/admin/users/{id}/sessions', tags: ['admin'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.array(sessionSchema))

const revokeSession = oc
  .route({ method: 'DELETE', path: '/admin/sessions/{id}', successStatus: 204, tags: ['admin'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.void())

export const adminContract = {
  users: { list: listUsers, updateRole, updateStatus, sessions: userSessions },
  sessions: { revoke: revokeSession },
}
