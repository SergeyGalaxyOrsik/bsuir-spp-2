import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { describeError } from './errors'

type Options<Values extends FieldValues> = {
  conflictField?: Path<Values>
  fieldAliases?: Record<string, Path<Values>>
}

export function applyServerError<Values extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<Values>,
  options: Options<Values> = {},
) {
  const description = describeError(error)
  const fieldEntries = Object.entries(description.fieldErrors)

  for (const [field, message] of fieldEntries) {
    setError((options.fieldAliases?.[field] ?? field) as Path<Values>, { message })
  }
  if (description.status === 409 && options.conflictField) {
    setError(options.conflictField, { message: description.message })
    return
  }
  if (fieldEntries.length === 0) setError('root.server', { message: description.message })
}
