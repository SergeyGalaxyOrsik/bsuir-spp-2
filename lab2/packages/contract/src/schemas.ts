import { z } from 'zod'

export const roleSchema = z.enum(['user', 'moderator', 'admin'])
export const userStatusSchema = z.enum(['active', 'blocked'])
export const promptModelSchema = z.enum(['gpt', 'claude', 'gemini', 'other'])

export const emailSchema = z.email().max(254)
export const passwordSchema = z.string().min(8).max(72)
export const nameSchema = z.string().trim().min(2).max(50)

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
})

export const sessionSchema = z.object({
  id: z.uuid(),
  userAgent: z.string(),
  ip: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
})

export const authResultSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
})

export const promptFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
  model: promptModelSchema,
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
})

export const promptSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  model: promptModelSchema,
  tags: z.array(z.string()),
  author: z.object({ id: z.uuid(), name: z.string() }),
  attachment: z.object({ name: z.string(), mime: z.string(), size: z.number() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const promptPageSchema = z.object({
  items: z.array(promptSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type Role = z.infer<typeof roleSchema>
export type UserStatus = z.infer<typeof userStatusSchema>
export type PromptModel = z.infer<typeof promptModelSchema>
export type UserDto = z.infer<typeof userSchema>
export type SessionDto = z.infer<typeof sessionSchema>
export type PromptDto = z.infer<typeof promptSchema>
