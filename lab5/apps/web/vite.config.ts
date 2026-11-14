import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  server: {
    // Same-origin GraphQL in development too: the dev server forwards to the gateway.
    proxy: { "/graphql": { target: process.env.GRAPHQL_URL?.replace(/\/graphql$/, "") ?? "http://localhost:4000", changeOrigin: true } },
  },
})

export default config
