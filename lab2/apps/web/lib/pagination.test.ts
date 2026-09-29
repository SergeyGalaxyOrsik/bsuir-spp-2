import { expect, test } from 'bun:test'
import { clampPage } from './pagination'

test('keeps a page that still exists', () => {
  expect(clampPage(2, 13, 12)).toBe(2)
})

test('falls back to the last page when the current one no longer exists', () => {
  expect(clampPage(2, 12, 12)).toBe(1)
})

test('never goes below the first page, even with no results', () => {
  expect(clampPage(3, 0, 12)).toBe(1)
})
