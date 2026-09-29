import type { PromptDto, UserDto } from '@lab2/contract'

export function canModifyPrompt(user: UserDto, prompt: PromptDto) {
  return prompt.author.id === user.id || user.role === 'moderator' || user.role === 'admin'
}
