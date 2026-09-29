import { z } from 'zod'

export const roleSchema = z.enum(['user', 'moderator', 'admin'])
export const userStatusSchema = z.enum(['active', 'blocked'])
export const promptModelSchema = z.enum(['gpt', 'claude', 'gemini', 'other'])

export const emailSchema = z.email('Enter a valid email address').max(254, 'Email must be at most 254 characters')
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be at most 50 characters')

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
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title must be at most 120 characters'),
  body: z.string().trim().min(1, 'Prompt text is required').max(10000, 'Prompt text must be at most 10000 characters'),
  model: promptModelSchema,
  tags: z
    .array(z.string().trim().min(1, 'Tags cannot be empty').max(30, 'Each tag must be at most 30 characters'))
    .max(10, 'Use at most 10 tags')
    .default([]),
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
