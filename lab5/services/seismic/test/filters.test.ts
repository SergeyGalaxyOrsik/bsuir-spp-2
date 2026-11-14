import { expect, test } from "bun:test"
import { severityOf, SEVERITY_BANDS, SORTS } from "../src/filters.ts"

test("severity bands follow the Richter classification", () => {
  expect(severityOf(1.2)).toBe("MICRO")
  expect(severityOf(3.9)).toBe("MINOR")
  expect(severityOf(5.0)).toBe("MODERATE")
  expect(severityOf(7.7)).toBe("MAJOR")
  expect(severityOf(9.1)).toBe("GREAT")
  expect(severityOf(null)).toBe("MICRO")
})

test("severity bands are contiguous", () => {
  for (let i = 1; i < SEVERITY_BANDS.length; i++) expect(SEVERITY_BANDS[i]![1]).toBe(SEVERITY_BANDS[i - 1]![2])
})

test("every sort expression is null-safe for keyset pagination", () => {
  for (const sort of Object.values(SORTS)) {
    if (sort.expr !== "time") expect(sort.expr).toStartWith("coalesce(")
  }
})
