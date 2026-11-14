/** Helpers for typed, validated URL search params (filters live in the URL, so views are shareable). */

export const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined)

export const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

export const bool = (v: unknown): boolean | undefined => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined)

export const strList = (v: unknown): string[] | undefined => {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []
  const clean = list.filter((x): x is string => typeof x === "string" && x !== "")
  return clean.length ? clean : undefined
}

export const isOneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => allowed.some((a) => a === v)

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return isOneOf(v, allowed) ? v : fallback
}

/** Own keys only: `"toString" in obj` is true for every object literal. */
const isKeyOf = <T extends object>(v: unknown, obj: T): v is keyof T & string =>
  typeof v === "string" && Object.hasOwn(obj, v)

export const keyOf = <T extends object>(v: unknown, obj: T): (keyof T & string) | undefined => (isKeyOf(v, obj) ? v : undefined)

export const listOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined => {
  const clean = strList(v)?.filter((x) => isOneOf(x, allowed))
  return clean?.length ? clean : undefined
}

export const pageSize = (v: unknown, fallback = 25) => {
  const n = num(v)
  return n && [10, 25, 50, 100].includes(n) ? n : fallback
}

/** Stack of `after` cursors for pages 2..n. */
export const cursorStack = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

/** Drop empty values so URLs stay short. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  ) as T
}
