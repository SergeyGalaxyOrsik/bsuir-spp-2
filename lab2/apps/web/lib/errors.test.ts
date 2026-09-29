import { expect, test } from 'bun:test'
import { ORPCError } from '@orpc/client'
import { describeError } from './errors'

test('validation errors become per-field messages keyed by the first path segment', () => {
  const error = new ORPCError('BAD_REQUEST', {
    message: 'Input validation failed',
    data: {
      issues: [
        { message: 'Too small', path: ['title'] },
        { message: 'Invalid email address', path: ['email'] },
      ],
    },
  })
  expect(describeError(error)).toMatchObject({
    status: 400,
    fieldErrors: { title: 'Too small', email: 'Invalid email address' },
  })
})

test('the first issue per field wins', () => {
  const error = new ORPCError('BAD_REQUEST', {
    message: 'x',
    data: { issues: [{ message: 'first', path: ['title'] }, { message: 'second', path: ['title'] }] },
  })
  expect(describeError(error).fieldErrors).toEqual({ title: 'first' })
})

test('request-level errors keep the server message', () => {
  const error = new ORPCError('NOT_FOUND', { message: 'Prompt not found' })
  expect(describeError(error)).toMatchObject({ status: 404, message: 'Prompt not found', fieldErrors: {} })
})

test('429 exposes the retry delay and includes it in the message', () => {
  const error = new ORPCError('TOO_MANY_REQUESTS', {
    message: 'Too many failed attempts. Try again later',
    data: { retryAfterSeconds: 900 },
  })
  const description = describeError(error)
  expect(description.retryAfterSeconds).toBe(900)
  expect(description.message).toContain('15 minutes')
})

test('server errors never show internal messages', () => {
  const error = new ORPCError('INTERNAL_SERVER_ERROR', { message: 'connection refused at 10.0.0.5' })
  expect(describeError(error).message).toBe('The server ran into a problem. Please try again later.')
})

test('network failures are explained', () => {
  expect(describeError(new TypeError('fetch failed')).message).toBe(
    'Cannot reach the server. Check your connection and try again.',
  )
})

test('unknown throwables fall back to a generic message', () => {
  expect(describeError('boom').message).toBe('Something went wrong. Please try again.')
})
