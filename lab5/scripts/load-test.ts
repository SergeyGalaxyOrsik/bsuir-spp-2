// Fires concurrent GraphQL requests at the gateway and reports latency percentiles and how
// many requests were answered, rate-limited (429) or shed (503).
// Usage: bun scripts/load-test.ts [requests=600] [concurrency=40] [url]
const total = Number(process.argv[2] ?? 600)
const concurrency = Number(process.argv[3] ?? 40)
const url = process.argv[4] ?? "http://localhost:4000/graphql"

const queries = [
  `{ earthquakes(first: 25, filter: { magnitude: { min: 5 } }) { totalCount nodes { id magnitude place country { name } } } }`,
  `{ countries(limit: 20, sort: { field: POPULATION, direction: DESC }) { items { name population seismicStats { count } } } }`,
  `{ naturalEvents(first: 20, filter: { status: OPEN }) { nodes { title primaryCategory { title } country { name } } } }`,
  `{ earthquakeStats { count maxMagnitude } hazardStats { count open } }`,
]

const latencies: number[] = []
const statuses = new Map<number, number>()
let cacheHits = 0
let next = 0
const started = performance.now()

async function worker() {
  while (next < total) {
    const i = next++
    const t = performance.now()
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: queries[i % queries.length] }),
      })
      const body = (await res.json()) as { extensions?: { responseCache?: { hit?: boolean } } }
      if (body.extensions?.responseCache?.hit) cacheHits++
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1)
    } catch {
      statuses.set(0, (statuses.get(0) ?? 0) + 1)
    }
    latencies.push(performance.now() - t)
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))
const seconds = (performance.now() - started) / 1000
latencies.sort((a, b) => a - b)
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]!.toFixed(1)

console.log(`requests: ${total}, concurrency: ${concurrency}, duration: ${seconds.toFixed(2)}s, throughput: ${(total / seconds).toFixed(0)} req/s`)
console.log(`latency ms — p50: ${pct(50)}, p95: ${pct(95)}, p99: ${pct(99)}, max: ${latencies.at(-1)!.toFixed(1)}`)
console.log(`status codes: ${[...statuses].map(([s, n]) => `${s === 0 ? "network error" : s}=${n}`).join(", ")}`)
console.log(`response cache hits: ${cacheHits}`)
