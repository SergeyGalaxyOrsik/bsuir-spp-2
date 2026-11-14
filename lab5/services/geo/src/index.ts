import { runService } from "@geopulse/shared";
import { countriesCollector, openMeteoCollector, worldBankCollector } from "./collectors.ts";
import { createContext, resolvers } from "./resolvers.ts";

await runService({
  name: "geo",
  defaultPort: 4001,
  schemaFile: new URL("./schema.graphql", import.meta.url),
  migrationsDir: new URL("../migrations", import.meta.url),
  collectors: () => [countriesCollector(), worldBankCollector(), openMeteoCollector()],
  resolvers: () => resolvers,
  context: (sql) => createContext(sql),
});
