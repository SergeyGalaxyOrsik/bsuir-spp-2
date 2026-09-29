import { base } from '../middleware/auth'
import { createPasswordRecoveryService } from '../services/password-recovery-service'

const forgot = base.auth.password.forgot.handler(({ input, context }) =>
  createPasswordRecoveryService(context.services).requestReset(input.email, context.log),
)

const reset = base.auth.password.reset.handler(({ input, context }) =>
  createPasswordRecoveryService(context.services).resetPassword(input.token, input.password, context.log),
)

export const passwordRoutes = { forgot, reset }
