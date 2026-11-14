import { runService } from "@geopulse/shared";
import { eonetCollector } from "./collector.ts";
import { createContext, resolvers } from "./resolvers.ts";

await runService({
  name: "hazards",
  defaultPort: 4003,
  schemaFile: new URL("./schema.graphql", import.meta.url),
  migrationsDir: new URL("../migrations", import.meta.url),
  collectors: (log) => [eonetCollector(log)],
  resolvers: () => resolvers,
  context: (sql) => createContext(sql),
});
