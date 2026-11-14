import { PgChannel, runService } from "@geopulse/shared";
import { usgsCollector } from "./collector.ts";
import { createContext, createResolvers } from "./resolvers.ts";

await runService({
  name: "seismic",
  defaultPort: 4002,
  schemaFile: new URL("./schema.graphql", import.meta.url),
  migrationsDir: new URL("../migrations", import.meta.url),
  collectors: (log) => [usgsCollector(log)],
  resolvers: ({ sql, log }) => createResolvers(new PgChannel(sql, "earthquakes", log)),
  context: (sql) => createContext(sql),
});
