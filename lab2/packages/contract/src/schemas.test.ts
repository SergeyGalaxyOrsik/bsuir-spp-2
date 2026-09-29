import { expect, test } from 'bun:test'
import { emailSchema, nameSchema, passwordSchema, promptFieldsSchema } from './schemas'

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message
}

test('field errors are written for people, not for validators', () => {
  expect(firstMessage(emailSchema.safeParse('nope'))).toBe('Enter a valid email address')
  expect(firstMessage(passwordSchema.safeParse('short'))).toBe('Password must be at least 8 characters')
  expect(firstMessage(passwordSchema.safeParse('a'.repeat(73)))).toBe('Password must be at most 72 characters')
  expect(firstMessage(nameSchema.safeParse('A'))).toBe('Name must be at least 2 characters')
})

test('prompt field errors name the field and the limit', () => {
  const messages = promptFieldsSchema
    .safeParse({ title: '', body: '', model: 'gpt', tags: [] })
    .error?.issues.map((issue) => issue.message)
  expect(messages).toEqual(['Title is required', 'Prompt text is required'])
  const tooLong = promptFieldsSchema.safeParse({ title: 'a'.repeat(121), body: 'b', model: 'gpt', tags: [] })
  expect(firstMessage(tooLong)).toBe('Title must be at most 120 characters')
})
