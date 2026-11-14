import { existsSync, readFileSync } from "node:fs";
import type { Logger } from "@geopulse/shared";
import { composeServices } from "@theguild/federation-composition";
import { parse } from "graphql";

export interface SubgraphConfig {
  name: string;
  url: string;
}

export function subgraphsFromEnv(): SubgraphConfig[] {
  const raw =
    process.env.SUBGRAPHS ??
    "geo=http://localhost:4001/graphql,seismic=http://localhost:4002/graphql,hazards=http://localhost:4003/graphql,ops=http://localhost:4004/graphql";
  return raw.split(",").map((pair) => {
    const [name, url] = pair.split("=");
    if (!name || !url) throw new Error(`Invalid SUBGRAPHS entry "${pair}"`);
    return { name, url };
  });
}

async function fetchSdl(subgraph: SubgraphConfig): Promise<string> {
  const res = await fetch(subgraph.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ _service { sdl } }" }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${subgraph.name}: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { _service?: { sdl?: string } }; errors?: { message: string }[] };
  const sdl = body.data?._service?.sdl;
  if (!sdl) throw new Error(`${subgraph.name}: ${body.errors?.[0]?.message ?? "no SDL returned"}`);
  return sdl;
}

export async function compose(subgraphs: SubgraphConfig[]) {
  const sdls = await Promise.all(subgraphs.map(async (s) => ({ ...s, sdl: await fetchSdl(s) })));
  const result = composeServices(sdls.map((s) => ({ name: s.name, url: s.url, typeDefs: parse(s.sdl) })));
  if (result.errors?.length) {
    throw new Error(`Supergraph composition failed:\n${result.errors.map((e) => `- ${e.message}`).join("\n")}`);
  }
  return { supergraphSdl: result.supergraphSdl!, publicSdl: result.publicSdl! };
}

/**
 * Supergraph source for the gateway: composes from live subgraphs on every poll.
 * When a subgraph is down, the last good supergraph keeps serving (no outage on redeploys).
 */
export function supergraphLoader(subgraphs: SubgraphConfig[], log: Logger) {
  let lastGood: string | undefined;
  let refreshing: Promise<void> | undefined;
  // Stale-while-revalidate: once a supergraph is known, a poll answers with it immediately and
  // recomposes in the background (picked up on the next poll). Otherwise a poll that lands while
  // a subgraph is down would hold incoming requests for the whole retry cycle of `compose`.
  const refresh = () =>
    (refreshing ??= compose(subgraphs)
      .then(({ supergraphSdl }) => {
        if (supergraphSdl !== lastGood) log.info({ subgraphs: subgraphs.map((s) => s.name) }, "supergraph recomposed");
        lastGood = supergraphSdl;
      })
      .catch((error) => log.warn({ err: (error as Error).message }, "recomposition failed, keeping previous supergraph"))
      .finally(() => (refreshing = undefined)));

  return async (): Promise<string> => {
    if (lastGood) {
      void refresh();
      return lastGood;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const { supergraphSdl } = await compose(subgraphs);
        if (supergraphSdl !== lastGood) log.info({ subgraphs: subgraphs.map((s) => s.name) }, "supergraph composed");
        lastGood = supergraphSdl;
        return supergraphSdl;
      } catch (error) {
        // A subgraph being down at boot must not keep the whole API offline: fall back to the
        // supergraph composed at build time (`bun run compose`) and keep polling for a live one.
        const fallback = new URL("../supergraph.graphql", import.meta.url);
        if (attempt >= 3 && existsSync(fallback)) {
          log.warn({ err: (error as Error).message }, "live composition failed, serving bundled supergraph.graphql");
          // Point the bundled graph at this deployment's subgraph URLs.
          return subgraphs.reduce(
            (sdl, sg) => sdl.replace(new RegExp(`(name: "${sg.name}", url: )"[^"]*"`), `$1"${sg.url}"`),
            readFileSync(fallback, "utf8"),
          );
        }
        if (attempt >= 60) throw error;
        log.warn({ attempt, err: (error as Error).message }, "subgraphs not ready, retrying composition");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
}
