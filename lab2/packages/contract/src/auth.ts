import { oc } from '@orpc/contract'
import { z } from 'zod'
import { authResultSchema, emailSchema, nameSchema, passwordSchema, sessionSchema, userSchema } from './schemas'

const register = oc
  .route({ method: 'POST', path: '/auth/register', successStatus: 201, tags: ['auth'] })
  .input(z.object({ email: emailSchema, name: nameSchema, password: passwordSchema }))
  .output(authResultSchema)

const login = oc
  .route({ method: 'POST', path: '/auth/login', tags: ['auth'] })
  .input(z.object({ email: emailSchema, password: z.string().min(1).max(72) }))
  .output(authResultSchema)

const refresh = oc.route({ method: 'POST', path: '/auth/refresh', tags: ['auth'] }).output(authResultSchema)

const logout = oc
  .route({ method: 'POST', path: '/auth/logout', successStatus: 204, tags: ['auth'] })
  .output(z.void())

const logoutAll = oc
  .route({ method: 'POST', path: '/auth/logout-all', successStatus: 204, tags: ['auth'] })
  .output(z.void())

const me = oc.route({ method: 'GET', path: '/auth/me', tags: ['auth'] }).output(userSchema)

const listSessions = oc
  .route({ method: 'GET', path: '/auth/sessions', tags: ['auth'] })
  .output(z.array(sessionSchema))

const revokeSession = oc
  .route({ method: 'DELETE', path: '/auth/sessions/{id}', successStatus: 204, tags: ['auth'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.void())

const forgotPassword = oc
  .route({ method: 'POST', path: '/auth/password/forgot', successStatus: 202, tags: ['auth'] })
  .input(z.object({ email: emailSchema }))
  .output(z.object({ message: z.string() }))

const resetPassword = oc
  .route({ method: 'POST', path: '/auth/password/reset', tags: ['auth'] })
  .input(z.object({ token: z.string().min(1).max(200), password: passwordSchema }))
  .output(z.object({ message: z.string() }))

export const authContract = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  sessions: { list: listSessions, revoke: revokeSession },
  password: { forgot: forgotPassword, reset: resetPassword },
}
