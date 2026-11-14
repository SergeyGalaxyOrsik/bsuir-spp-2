import { PgChannel, runService } from "@geopulse/shared";
import { createContext, createResolvers } from "./resolvers.ts";

await runService({
  name: "ops",
  defaultPort: 4004,
  schemaFile: new URL("./schema.graphql", import.meta.url),
  migrationsDir: new URL("../migrations", import.meta.url),
  resolvers: ({ sql, log }) => createResolvers(new PgChannel(sql, "ingest_runs", log)),
  context: (sql) => createContext(sql),
});
