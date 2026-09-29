import { adminContract } from './admin'
import { authContract } from './auth'
import { promptsContract } from './prompts'

export const contract = {
  auth: authContract,
  prompts: promptsContract,
  admin: adminContract,
}

export * from './attachment'
export * from './schemas'
