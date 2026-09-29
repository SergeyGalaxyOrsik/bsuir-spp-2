import { base } from './middleware/auth'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { passwordRoutes } from './routes/password'
import { promptRoutes } from './routes/prompts'
import { sessionRoutes } from './routes/sessions'

export const router = base.router({
  auth: { ...authRoutes, sessions: sessionRoutes, password: passwordRoutes },
  prompts: promptRoutes,
  admin: adminRoutes,
})
