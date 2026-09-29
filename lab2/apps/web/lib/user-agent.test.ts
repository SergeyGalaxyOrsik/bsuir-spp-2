import { expect, test } from 'bun:test'
import { describeUserAgent } from './user-agent'

test('recognizes common browsers and systems', () => {
  expect(
    describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'),
  ).toBe('Safari on macOS')
  expect(
    describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
  ).toBe('Chrome on Windows')
  expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('Firefox on Linux')
})

test('falls back for empty or unknown agents', () => {
  expect(describeUserAgent('')).toBe('Unknown device')
  expect(describeUserAgent('curl/8.0')).toBe('Unknown device')
})
