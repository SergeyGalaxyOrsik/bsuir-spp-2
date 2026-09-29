import type { Role } from '@lab2/contract'

const ROLES_THAT_MODERATE: readonly Role[] = ['moderator', 'admin']

export function canModifyPrompt(user: { id: string; role: Role }, prompt: { authorId: string }) {
  return prompt.authorId === user.id || ROLES_THAT_MODERATE.includes(user.role)
}
