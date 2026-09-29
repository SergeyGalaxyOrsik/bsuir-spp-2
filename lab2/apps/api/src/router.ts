import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { passwordRoutes } from './routes/password'
import { sessionRoutes } from './routes/sessions'

export const router = {
  auth: { ...authRoutes, sessions: sessionRoutes, password: passwordRoutes },
  admin: adminRoutes,
}
