import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { passwordRoutes } from './routes/password'
import { promptRoutes } from './routes/prompts'
import { sessionRoutes } from './routes/sessions'

export const router = {
  auth: { ...authRoutes, sessions: sessionRoutes, password: passwordRoutes },
  prompts: promptRoutes,
  admin: adminRoutes,
}
