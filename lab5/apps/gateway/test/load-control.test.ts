import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { streamLimit } from "../src/load-control.ts"

function sseApp(max: number) {
  const app = new Hono()
  app.use("*", streamLimit(max))
  app.get("/stream", () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/event-stream" } }))
  return app
}

describe("streamLimit", () => {
  test("holds a slot for as long as the stream stays open", async () => {
    const app = sseApp(1)
    const first = await app.request("/stream")
    expect(first.status).toBe(200)
    expect((await app.request("/stream")).status).toBe(503)

    await first.body?.cancel()
    const third = await app.request("/stream")
    expect(third.status).toBe(200)
    await third.body?.cancel()
  })
})
