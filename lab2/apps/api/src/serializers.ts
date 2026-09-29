import type { PromptDto, SessionDto, UserDto } from '@lab2/contract'
import type { PromptRecord } from './repositories/prompts'
import type { SessionRecord } from './repositories/sessions'
import type { UserRecord } from './repositories/users'

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  }
}

export function toSessionDto(session: SessionRecord, currentSessionId: string | null): SessionDto {
  return {
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  }
}

export function toPromptDto(prompt: PromptRecord): PromptDto {
  return {
    id: prompt.id,
    title: prompt.title,
    body: prompt.body,
    model: prompt.model,
    tags: prompt.tags,
    author: { id: prompt.authorId, name: prompt.authorName },
    attachment: prompt.attachment
      ? { name: prompt.attachment.name, mime: prompt.attachment.mime, size: prompt.attachment.size }
      : null,
    createdAt: prompt.createdAt.toISOString(),
    updatedAt: prompt.updatedAt.toISOString(),
  }
}
