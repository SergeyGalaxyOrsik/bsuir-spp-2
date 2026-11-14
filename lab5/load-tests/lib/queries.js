// GraphQL documents copied from the web UI (apps/web/src/routes/**), so the load mirrors real pages.

export const DASHBOARD = `
query Dashboard($since: DateTime!, $yearAgo: DateTime!) {
  totalRecords
  dataSources { id name health recordCount }
  allQuakes: earthquakeStats { count maxMagnitude lastAt }
  recentStats: earthquakeStats(filter: { time: { from: $since } }) {
    count avgMagnitude tsunamiCount totalEnergyJoules
    strongest { id magnitude place time }
  }
  timeline: earthquakeTimeline(filter: { time: { from: $yearAgo } }, bucket: WEEK) { bucket count maxMagnitude }
  magnitudeHistogram(filter: { time: { from: $yearAgo } }) { from count }
  topSeismicCountries(filter: { time: { from: $yearAgo } }, limit: 8) {
    count maxMagnitude country { code name flag population }
  }
  hazardStats { count open byCategory { count open category { id title } } }
  strongQuakes: earthquakes(filter: { magnitude: { min: 5.5 }, time: { from: $since } }, sort: { field: TIME, direction: DESC }, first: 60) {
    nodes { id magnitude place time latitude longitude country { code flag } }
  }
  openEvents: naturalEvents(filter: { status: OPEN }, sort: { field: LAST_OBSERVED_AT, direction: DESC }, first: 6) {
    totalCount
    nodes { id title lastObservedAt primaryCategory { title } country { code flag } }
  }
  countries(limit: 1) { total }
}`;

export const EARTHQUAKES = `
query Earthquakes($filter: EarthquakeFilter, $sort: EarthquakeSort, $first: Int, $after: String) {
  earthquakes(filter: $filter, sort: $sort, first: $first, after: $after) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes {
      id time magnitude magnitudeType depthKm latitude longitude place severity alert tsunami felt significance
      country { code name flag }
    }
  }
}`;

export const COUNTRIES = `
query Countries($filter: CountryFilter, $sort: CountrySort, $limit: Int, $offset: Int) {
  countries(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
    total limit offset hasMore
    items {
      code name localizedName(lang: "rus") flag region subregion population gdpPerCapita lifeExpectancy density incomeLevel
      seismicStats { count maxMagnitude }
      hazardStats { count open }
    }
  }
}`;

export const COUNTRY_FACETS = `
query CountryFacets {
  regions { name countryCount subregions }
  incomeLevels
}`;

export const COUNTRY_DETAIL = `
query CountryDetail($code: ID!) {
  country(code: $code) {
    code isoAlpha2 name officialName localizedName(lang: "rus") capital region subregion flag flagUrl
    population areaKm2 density gdpPerCapita lifeExpectancy incomeLevel landlocked unMember independent
    callingCodes topLevelDomains
    location { latitude longitude }
    capitalLocation { latitude longitude }
    languages { code name countryCount }
    currencies { code name symbol }
    weather { temperatureC apparentTemperatureC humidity windSpeedKmh precipitationMm description isDay observedAt }
    indicators(fromYear: 2000) {
      indicator { id name unit }
      points { year value }
      latest { year value }
      changePct
    }
    neighbors { code name flag seismicStats { count maxMagnitude } }
    seismicStats {
      count avgMagnitude maxMagnitude avgDepthKm tsunamiCount lastAt
      strongest { id magnitude place time }
    }
    recentEarthquakes(first: 5) { id magnitude place time latitude longitude }
    hazardStats { count open avgDurationDays byCategory { count open category { id title } } }
    naturalEvents(first: 10) {
      totalCount
      nodes { id title status startedAt latitude longitude primaryCategory { id title } }
    }
  }
}`;

export const COUNTRY_QUAKES = `
query CountryQuakes($code: ID!, $first: Int, $after: String) {
  country(code: $code) {
    code
    earthquakes(first: $first, after: $after, sort: { field: MAGNITUDE, direction: DESC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { id magnitude place time depthKm }
    }
  }
}`;

export const EVENTS = `
query NaturalEvents($filter: NaturalEventFilter, $sort: NaturalEventSort, $first: Int, $after: String) {
  naturalEvents(filter: $filter, sort: $sort, first: $first, after: $after) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes {
      id title status startedAt lastObservedAt durationDays latitude longitude pointCount
      magnitude { value unit }
      primaryCategory { id title }
      country { code name flag }
    }
  }
  hazardStats(filter: $filter) {
    count open
    byCategory { count open category { id title } }
  }
}`;

export const HAZARD_CATEGORIES = `query HazardCategories { hazardCategories { id title } }`;

// ---- Deliberately abusive documents for the protections scenario ----

/** 13 levels deep; the gateway allows at most 10 (MAX_QUERY_DEPTH). */
export const TOO_DEEP = `{ country(code: "FRA") { neighbors { neighbors { neighbors { neighbors { neighbors {
  neighbors { neighbors { neighbors { neighbors { neighbors { neighbors { code } } } } } } } } } } } } }`;

/** Estimated cost ≈ 58 500 > 20 000 (MAX_QUERY_COST): 100 countries × 8 × 8 × 8 neighbours. */
export const TOO_EXPENSIVE = `{ countries(limit: 100) { items { code neighbors { code neighbors { code neighbors { code } } } } } }`;

/** 20 aliases; the gateway allows 15. */
export const TOO_MANY_ALIASES = `{ ${Array.from({ length: 20 }, (_, i) => `a${i}: totalRecords`).join(" ")} }`;

export const CHEAP = `{ totalRecords }`;
