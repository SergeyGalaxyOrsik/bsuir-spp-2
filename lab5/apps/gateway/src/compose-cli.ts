// Writes the composed supergraph and the public API schema (used by web codegen).
import { writeFile } from "node:fs/promises";
import { compose, subgraphsFromEnv } from "./compose.ts";

const { supergraphSdl, publicSdl } = await compose(subgraphsFromEnv());
await writeFile(new URL("../supergraph.graphql", import.meta.url), supergraphSdl);
await writeFile(new URL("../../web/src/graphql/schema.graphql", import.meta.url), publicSdl);
console.log("supergraph.graphql and web/src/graphql/schema.graphql written");
