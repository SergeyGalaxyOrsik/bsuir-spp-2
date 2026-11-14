import { afterAll, describe, expect, test } from "bun:test"
import { CircuitBreaker, CircuitOpenError, fetchJson, HttpError, mapLimit } from "../src/http.ts"
import type { Sql } from "../src/db.ts"
import { createLogger } from "../src/logger.ts"
import { PgChannel } from "../src/pubsub.ts"
import { decodeCursor, encodeCursor, clampFirst } from "../src/pagination.ts"

const log = createLogger("test")
log.level = "silent"

describe("cursor pagination", () => {
  test("round-trips cursor values", () => {
    const cursor = { v: "2026-01-01T00:00:00.000Z", id: "us7000abcd" }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  test("rejects tampered cursors with BAD_USER_INPUT", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow("Invalid pagination cursor")
  })

  test("caps page size at 100", () => {
    expect(clampFirst(1000)).toBe(100)
    expect(clampFirst(undefined, 25)).toBe(25)
    expect(() => clampFirst(-1)).toThrow()
  })
})

describe("circuit breaker", () => {
  test("opens after threshold failures and short-circuits", async () => {
    const breaker = new CircuitBreaker("t", 2, 60_000)
    const fail = () => Promise.reject(new Error("boom"))
    await expect(breaker.run(fail)).rejects.toThrow("boom")
    await expect(breaker.run(fail)).rejects.toThrow("boom")
    expect(breaker.state).toBe("open")
    let called = false
    await expect(
      breaker.run(async () => {
        called = true
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError)
    expect(called).toBe(false)
  })

  test("half-open probe closes the circuit on success", async () => {
    const breaker = new CircuitBreaker("t", 1, 10)
    await expect(breaker.run(() => Promise.reject(new Error("x")))).rejects.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    expect(await breaker.run(async () => 42)).toBe(42)
    expect(breaker.state).toBe("closed")
  })

  test("half-open lets exactly one probe through while it is in flight", async () => {
    const breaker = new CircuitBreaker("t", 1, 10)
    await expect(breaker.run(() => Promise.reject(new Error("x")))).rejects.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    let release!: () => void
    const probe = breaker.run(() => new Promise<void>((r) => (release = r)))
    await expect(breaker.run(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError)
    release()
    await probe
    expect(breaker.state).toBe("closed")
    expect(await breaker.run(async () => 2)).toBe(2)
  })
})

describe("fetchJson", () => {
  let hits = 0
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/flaky") {
        hits++
        return hits < 3 ? new Response("down", { status: 503 }) : Response.json({ ok: true })
      }
      return new Response("nope", { status: 404 })
    },
  })
  afterAll(() => server.stop())

  test("retries transient 5xx with backoff and eventually succeeds", async () => {
    const result = await fetchJson<{ ok: boolean }>(`http://localhost:${server.port}/flaky`, { source: "test", log, retries: 4 })
    expect(result.ok).toBe(true)
    expect(hits).toBe(3)
  })

  test("does not retry 4xx", async () => {
    const started = Date.now()
    await expect(fetchJson(`http://localhost:${server.port}/missing`, { source: "test", log })).rejects.toBeInstanceOf(HttpError)
    expect(Date.now() - started).toBeLessThan(400)
  })
})

test("mapLimit preserves order and bounds concurrency", async () => {
  let active = 0
  let peak = 0
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++
    peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
    return n * 10
  })
  expect(out).toEqual([10, 20, 30, 40, 50, 60])
  expect(peak).toBe(2)
})

describe("PgChannel", () => {
  test("a failed LISTEN is retried by the next subscriber", async () => {
    let listens = 0
    let deliver: ((payload: string) => void) | undefined
    const fakeSql = {
      async listen(_channel: string, onNotify: (payload: string) => void) {
        listens++
        if (listens === 1) throw new Error("connection refused")
        deliver = onNotify
      },
    }
    const channel = new PgChannel(fakeSql as unknown as Sql, "events", log)

    await expect(channel.subscribe()[Symbol.asyncIterator]().next()).rejects.toThrow("connection refused")

    const subscriber = channel.subscribe()[Symbol.asyncIterator]()
    const received = subscriber.next()
    await new Promise((r) => setTimeout(r, 10))
    expect(listens).toBe(2)
    deliver?.("hello")
    expect((await received).value).toBe("hello")
    await subscriber.return?.()
  })
})
