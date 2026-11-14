// Production server: Hono on Node serves the built client assets and hands every other
// request to the TanStack Start SSR handler.
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { compress } from "hono/compress"
import handler from "./dist/server/server.js"

const GATEWAY = process.env.GRAPHQL_URL ?? "http://localhost:4000/graphql"

const app = new Hono()

// Browser GraphQL traffic (queries, mutations and SSE subscriptions) is forwarded to the gateway.
// x-real-ip is overwritten with the socket address so clients cannot spoof the rate-limit key.
app.all("/graphql", async (c) => {
  const headers = new Headers(c.req.raw.headers)
  headers.delete("host")
  headers.set("x-real-ip", c.env?.incoming?.socket?.remoteAddress ?? "unknown")
  if (process.env.INTERNAL_TOKEN) headers.set("x-internal-token", process.env.INTERNAL_TOKEN)
  const url = new URL(GATEWAY)
  url.search = new URL(c.req.url).search
  // GraphQL bodies are small: buffer them so a request can be replayed once if the pooled
  // connection turns out to point at a gateway pod that has just gone away.
  const body = c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.arrayBuffer()
  const send = () => fetch(url, { method: c.req.method, headers, body, signal: c.req.raw.signal })
  let upstream
  for (let attempt = 1; !upstream && attempt <= 2; attempt++) {
    upstream = await send().catch((error) => {
      if (!c.req.raw.signal.aborted) console.warn(`gateway request failed (attempt ${attempt}): ${error.cause?.code ?? error.message}`)
      return null
    })
  }
  if (!upstream) return c.json({ errors: [{ message: "Gateway unavailable", extensions: { code: "GATEWAY_UNAVAILABLE" } }] }, 502)
  const out = new Headers(upstream.headers)
  out.delete("content-encoding")
  out.delete("content-length")
  return new Response(upstream.body, { status: upstream.status, headers: out })
})

app.use("*", async (c, next) => (c.req.path === "/graphql" ? next() : compress()(c, next)))
app.get("/health", (c) => c.json({ status: "ok", service: "web" }))
app.use(
  "/assets/*",
  serveStatic({ root: "./dist/client", onFound: (_, c) => c.header("cache-control", "public, max-age=31536000, immutable") }),
)
app.use("*", serveStatic({ root: "./dist/client" }))
app.all("*", (c) => handler.fetch(c.req.raw))

const port = Number(process.env.PORT ?? 3000)
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => console.log(`web listening on :${port}`))
process.on("SIGTERM", () => server.close(() => process.exit(0)))
