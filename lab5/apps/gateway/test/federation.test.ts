// End-to-end checks against a running stack (docker compose up / scripts/dev-backend.sh).
import { describe, expect, test } from "bun:test"

const URL = process.env.GATEWAY_URL ?? "http://localhost:4000/graphql"
const up = await fetch(URL.replace("/graphql", "/ready")).then((r) => r.ok).catch(() => false)

async function gql<T = any>(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })
  return { status: res.status, ...((await res.json()) as { data: T; errors?: { message: string; extensions?: { code?: string } }[]; extensions?: any }) }
}

describe.skipIf(!up)("federated gateway", () => {
  test("resolves one query across all four subgraphs", async () => {
    const r = await gql(`{
      country(code: "JPN") { name seismicStats { count } hazardStats { count } }
      watchZones { name earthquakeCount(days: 365) }
      dataSources { id }
    }`)
    expect(r.errors).toBeUndefined()
    expect(r.data.country.name).toBe("Japan")
    expect(r.data.country.seismicStats.count).toBeGreaterThan(0)
    expect(r.data.dataSources).toHaveLength(5)
  })

  test("holds at least 10 000 collected records", async () => {
    const r = await gql(`{ totalRecords }`)
    expect(r.data.totalRecords).toBeGreaterThan(10_000)
  })

  test("cursor pages do not overlap and keep sort order", async () => {
    const q = `query($after: String) { earthquakes(first: 50, after: $after, sort: { field: MAGNITUDE, direction: DESC }) {
      pageInfo { endCursor hasNextPage } nodes { id magnitude } } }`
    const p1 = await gql(q)
    const p2 = await gql(q, { after: p1.data.earthquakes.pageInfo.endCursor })
    const ids1 = new Set(p1.data.earthquakes.nodes.map((n: any) => n.id))
    expect(p2.data.earthquakes.nodes.some((n: any) => ids1.has(n.id))).toBe(false)
    const mags = [...p1.data.earthquakes.nodes, ...p2.data.earthquakes.nodes].map((n: any) => n.magnitude ?? -10)
    expect(mags).toEqual([...mags].sort((a, b) => b - a))
  })

  test("filters are applied by the subgraph", async () => {
    const r = await gql(`{ earthquakes(first: 20, filter: { magnitude: { min: 6 }, countryCodes: ["JPN"] }) { nodes { magnitude country { code } } } }`)
    for (const n of r.data.earthquakes.nodes) {
      expect(n.magnitude).toBeGreaterThanOrEqual(6)
      expect(n.country.code).toBe("JPN")
    }
  })

  test("rejects too deep queries", async () => {
    const deep = `{ country(code:"RUS"){ neighbors{ neighbors{ neighbors{ neighbors{ neighbors{ neighbors{ neighbors{ neighbors{ neighbors{ name } } } } } } } } } } }`
    const r = await gql(deep)
    expect(r.errors?.[0]?.message).toContain("depth limit")
  })

  test("rejects too expensive queries (demand control)", async () => {
    const r = await gql(`{ earthquakes(first: 100) { nodes { nearby(first: 100) { aftershocks(first: 100) { id } } } } }`)
    expect(r.errors?.[0]?.extensions?.code).toBe("COST_ESTIMATED_TOO_EXPENSIVE")
  })

  test("watch zone mutation lifecycle with validation", async () => {
    const bad = await gql(`mutation { createWatchZone(input: { name: "x", latitude: 100, longitude: 0, radiusKm: 10 }) { zone { id } errors { field } } }`)
    expect(bad.data.createWatchZone.errors.map((e: any) => e.field).sort()).toEqual(["latitude", "name"])

    const created = await gql(`mutation { createWatchZone(input: { name: "E2E zone", latitude: 35.6, longitude: 139.7, radiusKm: 200, minMagnitude: 3 }) { zone { id name } errors { field } } }`)
    const id = created.data.createWatchZone.zone.id
    const updated = await gql(`mutation($id: ID!) { updateWatchZone(id: $id, patch: { radiusKm: 400 }) { zone { radiusKm earthquakeCount(days: 365) } } }`, { id })
    expect(updated.data.updateWatchZone.zone.radiusKm).toBe(400)
    const deleted = await gql(`mutation($id: ID!) { deleteWatchZone(id: $id) { deleted } }`, { id })
    expect(deleted.data.deleteWatchZone.deleted).toBe(true)
  })
})
