import { expect, test } from 'bun:test'
import { attachmentRules, resolveAttachmentMime, validateAttachment } from './attachment'

test('accepts an allowed type within the size limit', () => {
  expect(validateAttachment({ name: 'a.png', type: 'image/png', size: 1024 })).toBeNull()
})

test('rejects a disallowed mime type', () => {
  expect(validateAttachment({ name: 'a.zip', type: 'application/zip', size: 1024 })).toBe(
    'Unsupported file type. Allowed: PNG, JPEG, WebP, TXT, Markdown, PDF',
  )
})

test('rejects a file above the size limit', () => {
  expect(
    validateAttachment({ name: 'a.pdf', type: 'application/pdf', size: attachmentRules.maxBytes + 1 }),
  ).toBe('File is too large. Maximum size is 5 MB')
})

test('accepts markdown and text files whose browser-reported type is empty', () => {
  expect(validateAttachment({ name: 'notes.md', type: '', size: 10 })).toBeNull()
  expect(resolveAttachmentMime({ name: 'notes.md', type: '' })).toBe('text/markdown')
  expect(resolveAttachmentMime({ name: 'notes.TXT', type: 'application/octet-stream' })).toBe('text/plain')
})

test('strips mime parameters', () => {
  expect(resolveAttachmentMime({ name: 'a.txt', type: 'text/plain;charset=utf-8' })).toBe('text/plain')
})
