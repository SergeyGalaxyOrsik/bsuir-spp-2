// Composes the supergraph from the subgraph schema files (no running services needed) and writes
// the supergraph plus the public API schema used by the web app's codegen.
import { readFile, writeFile } from "node:fs/promises"
import { composeServices } from "@theguild/federation-composition"
import { parse } from "graphql"
import { subgraphsFromEnv } from "./compose.ts"

const root = new URL("../../../", import.meta.url)
const services = await Promise.all(
  subgraphsFromEnv().map(async (s) => ({
    name: s.name,
    url: s.url,
    typeDefs: parse(await readFile(new URL(`services/${s.name}/src/schema.graphql`, root), "utf8")),
  })),
)
const result = composeServices(services)
if (result.errors?.length) {
  console.error(result.errors.map((e) => `- ${e.message}`).join("\n"))
  process.exit(1)
}
await writeFile(new URL("apps/gateway/supergraph.graphql", root), result.supergraphSdl!)
await writeFile(new URL("apps/web/src/graphql/schema.graphql", root), result.publicSdl!)
console.log("supergraph.graphql and web/src/graphql/schema.graphql written")
