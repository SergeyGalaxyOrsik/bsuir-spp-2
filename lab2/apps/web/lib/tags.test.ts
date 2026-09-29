import { expect, test } from 'bun:test'
import { parseTags } from './tags'

test('splits on commas, trims and drops empty entries', () => {
  expect(parseTags(' writing , seo,, ')).toEqual(['writing', 'seo'])
})

test('removes duplicates while keeping the first occurrence order', () => {
  expect(parseTags('a, b, a, c, b')).toEqual(['a', 'b', 'c'])
})

test('returns an empty list for blank input', () => {
  expect(parseTags('   ')).toEqual([])
})
