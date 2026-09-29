import { expect, test } from 'bun:test'
import { canModifyPrompt } from '../src/prompts/permissions'

const prompt = { authorId: 'author' }

test('authors can modify their own prompts', () => {
  expect(canModifyPrompt({ id: 'author', role: 'user' }, prompt)).toBe(true)
})

test('plain users cannot modify others\' prompts', () => {
  expect(canModifyPrompt({ id: 'other', role: 'user' }, prompt)).toBe(false)
})

test('moderators and admins can modify any prompt', () => {
  expect(canModifyPrompt({ id: 'other', role: 'moderator' }, prompt)).toBe(true)
  expect(canModifyPrompt({ id: 'other', role: 'admin' }, prompt)).toBe(true)
})
