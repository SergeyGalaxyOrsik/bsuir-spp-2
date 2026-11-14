// Production server: Hono on Node serves the built client assets and hands every other
// request to the TanStack Start SSR handler.
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { compress } from "hono/compress"
import handler from "./dist/server/server.js"

const app = new Hono()
app.use("*", compress())
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
