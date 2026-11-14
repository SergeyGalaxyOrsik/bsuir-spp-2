// User journeys that reproduce what the web UI pages request.
// Each journey mixes a "fixed" path (default page, identical variables → response cache)
// and a "random" path (randomized filters/sort/cursors → goes to subgraphs and Postgres).
import { sleep } from "k6";
import { gql } from "./graphql.js";
import * as Q from "./queries.js";

const COUNTRIES = ["USA", "RUS", "IDN", "JPN", "PHL", "PNG", "CAN", "CHL", "TON", "VUT", "MEX", "CHN", "GRC", "NZL", "ARG",
  "FJI", "PER", "ETH", "IRN", "AFG", "TUR", "ITA", "FRA", "DEU", "BRA", "IND", "AUS", "ISL", "NPL", "PAK"];
const QUAKE_SEARCH = ["Alaska", "Japan", "California", "Chile", "Fiji", "Tonga", "Indonesia", "Hawaii", "Kuril", "Mexico", "Peru", "Greece"];
const EVENT_SEARCH = ["fire", "storm", "Volcano", "Iceberg", "Typhoon", "Cyclone", "Flood"];
const QUAKE_SORT = ["TIME", "MAGNITUDE", "DEPTH", "SIGNIFICANCE", "FELT"];
const EVENT_SORT = ["STARTED_AT", "LAST_OBSERVED_AT", "MAGNITUDE", "TITLE", "DURATION"];
const COUNTRY_SORT = ["NAME", "POPULATION", "AREA", "DENSITY", "GDP_PER_CAPITA", "LIFE_EXPECTANCY"];
const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"];
const CATEGORIES = ["wildfires", "severeStorms", "volcanoes", "seaLakeIce", "floods", "earthquakes", "drought"];
const SEVERITIES = ["MINOR", "LIGHT", "MODERATE", "STRONG", "MAJOR"];
const QUAKE_PERIODS = [7, 30, 90, 365, 0];
const EVENT_PERIODS = [30, 90, 365, 1095, 0];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const round1 = (x) => Math.round(x * 10) / 10;
const hourIso = (daysAgo) => new Date(Math.floor(Date.now() / 3600000) * 3600000 - daysAgo * 86400000).toISOString();
const dayIso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10) + "T00:00:00Z";

/** Pause like a human between page actions: uniform in [0.5, 1.5] × mean. */
export function think(meanMs) {
  if (meanMs > 0) sleep((meanMs * (0.5 + Math.random())) / 1000);
}

function compact(o) {
  const out = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

// ---------------- Dashboard (/) ----------------
export function dashboard() {
  // Same hour-rounded variables as the UI → identical for every client within the hour.
  gql("Dashboard", Q.DASHBOARD, { since: hourIso(30), yearAgo: hourIso(365) }, { variant: "fixed" });
}

// ---------------- Earthquakes (/earthquakes) ----------------
function randomQuakeFilter() {
  const days = pick(QUAKE_PERIODS);
  const minMag = chance(0.7) ? round1(2.5 + Math.random() * 4) : undefined;
  return compact({
    search: chance(0.25) ? pick(QUAKE_SEARCH) : undefined,
    magnitude: minMag != null ? { min: minMag } : undefined,
    depthKm: chance(0.2) ? { max: pick([10, 35, 70, 300]) } : undefined,
    time: days ? { from: hourIso(days) } : undefined,
    severities: chance(0.15) ? [pick(SEVERITIES)] : undefined,
    countryCodes: chance(0.3) ? [pick(COUNTRIES)] : undefined,
    tsunami: chance(0.05) ? true : undefined,
  });
}

export function earthquakes(thinkMean, { fixedShare = 0.5, maxPages = 3 } = {}) {
  const fixed = chance(fixedShare);
  const variables = fixed
    ? { filter: {}, sort: { field: "TIME", direction: "DESC" }, first: 25 }
    : { filter: randomQuakeFilter(), sort: { field: pick(QUAKE_SORT), direction: pick(["ASC", "DESC"]) }, first: pick([25, 25, 50]) };
  let { body } = gql("Earthquakes", Q.EARTHQUAKES, variables, { variant: fixed ? "fixed" : "random" });
  // Cursor pagination: the user clicks "next" a couple of times.
  const pages = Math.floor(Math.random() * maxPages);
  for (let i = 0; i < pages; i++) {
    const conn = body && body.data && body.data.earthquakes;
    if (!conn || !conn.pageInfo.hasNextPage) break;
    think(thinkMean);
    ({ body } = gql("Earthquakes", Q.EARTHQUAKES, { ...variables, after: conn.pageInfo.endCursor }, { variant: fixed ? "fixed" : "random" }));
  }
}

// ---------------- Country detail (/countries/$code) ----------------
export function countryDetail(thinkMean) {
  const code = pick(COUNTRIES);
  gql("CountryDetail", Q.COUNTRY_DETAIL, { code }, { variant: "random" });
  think(thinkMean);
  const { body } = gql("CountryQuakes", Q.COUNTRY_QUAKES, { code, first: 10 }, { variant: "random" });
  const conn = body && body.data && body.data.country && body.data.country.earthquakes;
  if (conn && conn.pageInfo.hasNextPage && chance(0.4)) {
    think(thinkMean);
    gql("CountryQuakes", Q.COUNTRY_QUAKES, { code, first: 10, after: conn.pageInfo.endCursor }, { variant: "random" });
  }
}

// ---------------- Natural events (/events) ----------------
export function events(thinkMean, { fixedShare = 0.4 } = {}) {
  gql("HazardCategories", Q.HAZARD_CATEGORIES, {}, { variant: "fixed" });
  const fixed = chance(fixedShare);
  const days = pick(EVENT_PERIODS);
  const variables = fixed
    ? { filter: {}, sort: { field: "STARTED_AT", direction: "DESC" }, first: 25 }
    : {
        filter: compact({
          search: chance(0.25) ? pick(EVENT_SEARCH) : undefined,
          categoryIds: chance(0.5) ? [pick(CATEGORIES)] : undefined,
          status: chance(0.4) ? pick(["OPEN", "CLOSED"]) : undefined,
          started: days ? { from: dayIso(days) } : undefined,
          countryCodes: chance(0.25) ? [pick(COUNTRIES)] : undefined,
        }),
        sort: { field: pick(EVENT_SORT), direction: pick(["ASC", "DESC"]) },
        first: 25,
      };
  const { body } = gql("NaturalEvents", Q.EVENTS, variables, { variant: fixed ? "fixed" : "random" });
  const conn = body && body.data && body.data.naturalEvents;
  if (conn && conn.pageInfo.hasNextPage && chance(0.4)) {
    think(thinkMean);
    gql("NaturalEvents", Q.EVENTS, { ...variables, after: conn.pageInfo.endCursor }, { variant: fixed ? "fixed" : "random" });
  }
}

// ---------------- Countries (/countries) ----------------
export function countries(thinkMean, { fixedShare = 0.4 } = {}) {
  gql("CountryFacets", Q.COUNTRY_FACETS, {}, { variant: "fixed" });
  const fixed = chance(fixedShare);
  const variables = fixed
    ? { filter: {}, sort: { field: "POPULATION", direction: "DESC" }, limit: 25, offset: 0 }
    : {
        filter: compact({
          search: chance(0.2) ? pick(["an", "ia", "Rep", "is", "or"]) : undefined,
          regions: chance(0.4) ? [pick(REGIONS)] : undefined,
          landlocked: chance(0.1) ? true : undefined,
        }),
        sort: { field: pick(COUNTRY_SORT), direction: pick(["ASC", "DESC"]) },
        limit: 25,
        offset: pick([0, 0, 25, 50, 75]),
      };
  gql("Countries", Q.COUNTRIES, variables, { variant: fixed ? "fixed" : "random" });
}

/** One weighted "page visit" approximating real navigation. */
export function randomVisit(thinkMean) {
  const r = Math.random();
  if (r < 0.15) dashboard();
  else if (r < 0.5) earthquakes(thinkMean);
  else if (r < 0.7) countryDetail(thinkMean);
  else if (r < 0.85) events(thinkMean);
  else countries(thinkMean);
  think(thinkMean);
}
