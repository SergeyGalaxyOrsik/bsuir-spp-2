import { authRoutes } from './routes/auth'
import { sessionRoutes } from './routes/sessions'

export const router = {
  auth: { ...authRoutes, sessions: sessionRoutes },
}
