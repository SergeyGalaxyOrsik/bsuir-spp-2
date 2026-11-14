/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type AlertLevel =
  | 'GREEN'
  | 'ORANGE'
  | 'RED'
  | 'YELLOW';

export type CountryFilter = {
  areaKm2?: FloatRange | null | undefined;
  codes?: Array<string> | null | undefined;
  currencyCodes?: Array<string> | null | undefined;
  gdpPerCapita?: FloatRange | null | undefined;
  incomeLevels?: Array<string> | null | undefined;
  independent?: boolean | null | undefined;
  landlocked?: boolean | null | undefined;
  languageCodes?: Array<string> | null | undefined;
  population?: FloatRange | null | undefined;
  regions?: Array<string> | null | undefined;
  /** Matches name, official name, Russian name, capital or code. */
  search?: string | null | undefined;
  subregions?: Array<string> | null | undefined;
  unMember?: boolean | null | undefined;
};

export type CountrySort = {
  direction?: SortDirection;
  field?: CountrySortField;
};

export type CountrySortField =
  | 'AREA'
  | 'DENSITY'
  | 'GDP_PER_CAPITA'
  | 'LIFE_EXPECTANCY'
  | 'NAME'
  | 'POPULATION';

export type EarthquakeFilter = {
  alertLevels?: Array<AlertLevel> | null | undefined;
  /** ISO 3166-1 alpha-3 country codes. */
  countryCodes?: Array<string> | null | undefined;
  depthKm?: FloatRange | null | undefined;
  /** Only events attributed to some country (true) or offshore/unknown (false). */
  hasCountry?: boolean | null | undefined;
  magnitude?: FloatRange | null | undefined;
  minSignificance?: number | null | undefined;
  near?: GeoRadius | null | undefined;
  /** Case-insensitive substring match on the place description (trigram indexed). */
  search?: string | null | undefined;
  severities?: Array<Severity> | null | undefined;
  time?: TimeRange | null | undefined;
  tsunami?: boolean | null | undefined;
  /** Event type, e.g. earthquake, quarry blast, explosion. */
  types?: Array<string> | null | undefined;
};

export type EarthquakeSort = {
  direction?: SortDirection;
  field?: EarthquakeSortField;
};

export type EarthquakeSortField =
  | 'DEPTH'
  | 'FELT'
  | 'MAGNITUDE'
  | 'SIGNIFICANCE'
  | 'TIME';

export type EventStatus =
  | 'CLOSED'
  | 'OPEN';

export type FloatRange = {
  max?: number | null | undefined;
  min?: number | null | undefined;
};

export type GeoRadius = {
  latitude: number;
  longitude: number;
  radiusKm: number;
};

/** World Bank World Development Indicators tracked by GeoPulse. */
export type IndicatorId =
  | 'CO2_PER_CAPITA'
  | 'ELECTRICITY_ACCESS_PCT'
  | 'FOREST_AREA_PCT'
  | 'GDP'
  | 'GDP_PER_CAPITA'
  | 'LIFE_EXPECTANCY'
  | 'POPULATION'
  | 'URBAN_POPULATION_PCT';

export type IngestMode =
  | 'FULL'
  | 'INCREMENTAL';

export type IngestStatus =
  | 'FAILED'
  | 'INTERRUPTED'
  | 'PARTIAL'
  | 'RUNNING'
  | 'SUCCEEDED';

export type NaturalEventFilter = {
  categoryIds?: Array<string | number> | null | undefined;
  countryCodes?: Array<string> | null | undefined;
  hasCountry?: boolean | null | undefined;
  magnitude?: FloatRange | null | undefined;
  magnitudeUnit?: string | null | undefined;
  near?: GeoRadius | null | undefined;
  /** Case-insensitive substring match on the title. */
  search?: string | null | undefined;
  sourceIds?: Array<string | number> | null | undefined;
  started?: TimeRange | null | undefined;
  status?: EventStatus | null | undefined;
};

export type NaturalEventSort = {
  direction?: SortDirection;
  field?: NaturalEventSortField;
};

export type NaturalEventSortField =
  | 'DURATION'
  | 'LAST_OBSERVED_AT'
  | 'MAGNITUDE'
  | 'STARTED_AT'
  | 'TITLE';

/** Descriptive class derived from magnitude (Richter scale bands). */
export type Severity =
  | 'GREAT'
  | 'LIGHT'
  | 'MAJOR'
  | 'MICRO'
  | 'MINOR'
  | 'MODERATE'
  | 'STRONG';

export type SortDirection =
  | 'ASC'
  | 'DESC';

export type SourceHealth =
  | 'FAILING'
  | 'HEALTHY'
  | 'STALE'
  | 'UNKNOWN';

export type TimeRange = {
  from?: string | null | undefined;
  to?: string | null | undefined;
};

export type WatchZoneInput = {
  color?: string | null | undefined;
  description?: string | null | undefined;
  latitude: number;
  longitude: number;
  minMagnitude?: number | null | undefined;
  name: string;
  radiusKm: number;
};

export type WatchZonePatch = {
  color?: string | null | undefined;
  description?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  minMagnitude?: number | null | undefined;
  name?: string | null | undefined;
  radiusKm?: number | null | undefined;
};

export type LiveQuakesSubscriptionVariables = Exact<{
  min?: number | null | undefined;
}>;


export type LiveQuakesSubscription = { earthquakeDetected: { id: string, magnitude: number | null, place: string | null } };

export type CountryDetailQueryVariables = Exact<{
  code: string | number;
}>;


export type CountryDetailQuery = { country: { code: string, isoAlpha2: string, name: string, officialName: string, localizedName: string | null, capital: string | null, region: string, subregion: string | null, flag: string | null, flagUrl: string | null, population: number | null, areaKm2: number | null, density: number | null, gdpPerCapita: number | null, lifeExpectancy: number | null, incomeLevel: string | null, landlocked: boolean, unMember: boolean, independent: boolean | null, callingCodes: Array<string>, topLevelDomains: Array<string>, location: { latitude: number, longitude: number } | null, capitalLocation: { latitude: number, longitude: number } | null, languages: Array<{ code: string, name: string, countryCount: number }>, currencies: Array<{ code: string, name: string, symbol: string | null }>, weather: { temperatureC: number | null, apparentTemperatureC: number | null, humidity: number | null, windSpeedKmh: number | null, precipitationMm: number | null, description: string, isDay: boolean | null, observedAt: string } | null, indicators: Array<{ changePct: number | null, indicator: { id: IndicatorId, name: string, unit: string | null }, points: Array<{ year: number, value: number | null }>, latest: { year: number, value: number | null } | null }>, neighbors: Array<{ code: string, name: string, flag: string | null, seismicStats: { count: number, maxMagnitude: number | null } | null }>, seismicStats: { count: number, avgMagnitude: number | null, maxMagnitude: number | null, avgDepthKm: number | null, tsunamiCount: number, lastAt: string | null, strongest: { id: string, magnitude: number | null, place: string | null, time: string } | null } | null, recentEarthquakes: Array<{ id: string, magnitude: number | null, place: string | null, time: string, latitude: number, longitude: number }> | null, hazardStats: { count: number, open: number, avgDurationDays: number | null, byCategory: Array<{ count: number, open: number, category: { id: string, title: string } }> } | null, naturalEvents: { totalCount: number, nodes: Array<{ id: string, title: string, status: EventStatus, startedAt: string, latitude: number, longitude: number, primaryCategory: { id: string, title: string } }> } | null } | null };

export type CountryQuakesQueryVariables = Exact<{
  code: string | number;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;


export type CountryQuakesQuery = { country: { code: string, earthquakes: { totalCount: number, pageInfo: { hasNextPage: boolean, endCursor: string | null }, nodes: Array<{ id: string, magnitude: number | null, place: string | null, time: string, depthKm: number | null }> } | null } | null };

export type CountriesQueryVariables = Exact<{
  filter?: CountryFilter | null | undefined;
  sort?: CountrySort | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type CountriesQuery = { countries: { total: number, limit: number, offset: number, hasMore: boolean, items: Array<{ code: string, name: string, localizedName: string | null, flag: string | null, region: string, subregion: string | null, population: number | null, gdpPerCapita: number | null, lifeExpectancy: number | null, density: number | null, incomeLevel: string | null, seismicStats: { count: number, maxMagnitude: number | null } | null, hazardStats: { count: number, open: number } | null }> } };

export type CountryFacetsQueryVariables = Exact<{ [key: string]: never; }>;


export type CountryFacetsQuery = { incomeLevels: Array<string>, regions: Array<{ name: string, countryCount: number, subregions: Array<string> }> };

export type EarthquakeDetailQueryVariables = Exact<{
  id: string | number;
  radiusKm: number;
}>;


export type EarthquakeDetailQuery = { earthquake: { id: string, time: string, updatedAt: string, magnitude: number | null, magnitudeType: string | null, depthKm: number | null, latitude: number, longitude: number, place: string | null, type: string, status: string | null, tsunami: boolean, alert: AlertLevel | null, felt: number | null, cdi: number | null, mmi: number | null, significance: number | null, network: string | null, url: string | null, severity: Severity, energyJoules: number | null, country: { code: string, name: string, localizedName: string | null, flag: string | null, capital: string | null, population: number | null, region: string, weather: { temperatureC: number | null, description: string } | null, seismicStats: { count: number, maxMagnitude: number | null } | null } | null, nearby: Array<{ id: string, magnitude: number | null, place: string | null, time: string, latitude: number, longitude: number }>, aftershocks: Array<{ id: string, magnitude: number | null, place: string | null, time: string, latitude: number, longitude: number }> } | null };

export type EarthquakesQueryVariables = Exact<{
  filter?: EarthquakeFilter | null | undefined;
  sort?: EarthquakeSort | null | undefined;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;


export type EarthquakesQuery = { earthquakes: { totalCount: number, pageInfo: { hasNextPage: boolean, endCursor: string | null }, nodes: Array<{ id: string, time: string, magnitude: number | null, magnitudeType: string | null, depthKm: number | null, latitude: number, longitude: number, place: string | null, severity: Severity, alert: AlertLevel | null, tsunami: boolean, felt: number | null, significance: number | null, country: { code: string, name: string, flag: string | null } | null }> } };

export type NaturalEventDetailQueryVariables = Exact<{
  id: string | number;
}>;


export type NaturalEventDetailQuery = { naturalEvent: { id: string, title: string, description: string | null, link: string | null, status: EventStatus, startedAt: string, lastObservedAt: string, closedAt: string | null, durationDays: number, latitude: number, longitude: number, pointCount: number, magnitude: { value: number, unit: string | null } | null, primaryCategory: { id: string, title: string }, categories: Array<{ id: string, title: string, description: string | null }>, sources: Array<{ url: string | null, source: { id: string, title: string } }>, track: Array<{ observedAt: string, latitude: number, longitude: number, geometryType: string, magnitude: { value: number, unit: string | null } | null }>, country: { code: string, name: string, flag: string | null, localizedName: string | null, region: string } | null, related: Array<{ id: string, title: string, startedAt: string, status: EventStatus, primaryCategory: { id: string, title: string } }>, nearbyEarthquakes: Array<{ id: string, magnitude: number | null, place: string | null, time: string, depthKm: number | null }> | null } | null };

export type NaturalEventsQueryVariables = Exact<{
  filter?: NaturalEventFilter | null | undefined;
  sort?: NaturalEventSort | null | undefined;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;


export type NaturalEventsQuery = { naturalEvents: { totalCount: number, pageInfo: { hasNextPage: boolean, endCursor: string | null }, nodes: Array<{ id: string, title: string, status: EventStatus, startedAt: string, lastObservedAt: string, durationDays: number, latitude: number, longitude: number, pointCount: number, magnitude: { value: number, unit: string | null } | null, primaryCategory: { id: string, title: string }, country: { code: string, name: string, flag: string | null } | null }> }, hazardStats: { count: number, open: number, byCategory: Array<{ count: number, open: number, category: { id: string, title: string } }> } };

export type HazardCategoriesQueryVariables = Exact<{ [key: string]: never; }>;


export type HazardCategoriesQuery = { hazardCategories: Array<{ id: string, title: string }> };

export type DashboardQueryVariables = Exact<{
  since: string;
  yearAgo: string;
}>;


export type DashboardQuery = { totalRecords: number, dataSources: Array<{ id: string, name: string, health: SourceHealth, recordCount: number | null }>, allQuakes: { count: number, maxMagnitude: number | null, lastAt: string | null }, recentStats: { count: number, avgMagnitude: number | null, tsunamiCount: number, totalEnergyJoules: number | null, strongest: { id: string, magnitude: number | null, place: string | null, time: string } | null }, timeline: Array<{ bucket: string, count: number, maxMagnitude: number | null }>, magnitudeHistogram: Array<{ from: number, count: number }>, topSeismicCountries: Array<{ count: number, maxMagnitude: number | null, country: { code: string, name: string, flag: string | null, population: number | null } }>, hazardStats: { count: number, open: number, byCategory: Array<{ count: number, open: number, category: { id: string, title: string } }> }, strongQuakes: { nodes: Array<{ id: string, magnitude: number | null, place: string | null, time: string, latitude: number, longitude: number, country: { code: string, flag: string | null } | null }> }, openEvents: { totalCount: number, nodes: Array<{ id: string, title: string, lastObservedAt: string, primaryCategory: { title: string }, country: { code: string, flag: string | null } | null }> }, countries: { total: number } };

export type DashboardLiveFeedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type DashboardLiveFeedSubscription = { earthquakeDetected: { id: string, magnitude: number | null, place: string | null, time: string, country: { flag: string | null } | null } };

export type RunFieldsFragment = { id: string, mode: IngestMode, triggeredBy: string, status: IngestStatus, progress: number, message: string | null, recordsFetched: number, recordsUpserted: number, totalRecords: number | null, warnings: Array<string>, error: string | null, startedAt: string, finishedAt: string | null, durationMs: number | null, host: string | null, source: { id: string, name: string } };

export type OpsOverviewQueryVariables = Exact<{ [key: string]: never; }>;


export type OpsOverviewQuery = { totalRecords: number, dataSources: Array<{ id: string, name: string, description: string, homepage: string, service: string, refreshInterval: string, health: SourceHealth, recordCount: number | null, lastSuccessAt: string | null, lastRun: { id: string, mode: IngestMode, triggeredBy: string, status: IngestStatus, progress: number, message: string | null, recordsFetched: number, recordsUpserted: number, totalRecords: number | null, warnings: Array<string>, error: string | null, startedAt: string, finishedAt: string | null, durationMs: number | null, host: string | null, source: { id: string, name: string } } | null }>, systemStatus: Array<{ name: string, url: string, up: boolean, latencyMs: number | null, detail: string | null }> };

export type OpsRunsQueryVariables = Exact<{
  status?: IngestStatus | null | undefined;
  source?: string | number | null | undefined;
  first?: number | null | undefined;
  after?: string | null | undefined;
}>;


export type OpsRunsQuery = { ingestRuns: { totalCount: number, pageInfo: { hasNextPage: boolean, endCursor: string | null }, nodes: Array<{ id: string, mode: IngestMode, triggeredBy: string, status: IngestStatus, progress: number, message: string | null, recordsFetched: number, recordsUpserted: number, totalRecords: number | null, warnings: Array<string>, error: string | null, startedAt: string, finishedAt: string | null, durationMs: number | null, host: string | null, source: { id: string, name: string } }> } };

export type TriggerIngestMutationVariables = Exact<{
  source: string | number;
  mode?: IngestMode | null | undefined;
}>;


export type TriggerIngestMutation = { triggerIngest: { accepted: boolean, runId: string | null, message: string } };

export type IngestRunUpdatesSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type IngestRunUpdatesSubscription = { ingestRunUpdated: { id: string, mode: IngestMode, triggeredBy: string, status: IngestStatus, progress: number, message: string | null, recordsFetched: number, recordsUpserted: number, totalRecords: number | null, warnings: Array<string>, error: string | null, startedAt: string, finishedAt: string | null, durationMs: number | null, host: string | null, source: { id: string, name: string } } };

export type WatchZonesQueryVariables = Exact<{
  days: number;
}>;


export type WatchZonesQuery = { watchZones: Array<{ id: string, name: string, description: string | null, latitude: number, longitude: number, radiusKm: number, minMagnitude: number, color: string, createdAt: string, updatedAt: string, earthquakeCount: number | null, naturalEventCount: number | null, earthquakes: Array<{ id: string, magnitude: number | null, place: string | null, time: string }> | null, naturalEvents: Array<{ id: string, title: string, status: EventStatus, lastObservedAt: string, primaryCategory: { title: string } }> | null }> };

export type CreateWatchZoneMutationVariables = Exact<{
  input: WatchZoneInput;
}>;


export type CreateWatchZoneMutation = { createWatchZone: { zone: { id: string, name: string } | null, errors: Array<{ field: string, message: string }> } };

export type UpdateWatchZoneMutationVariables = Exact<{
  id: string | number;
  patch: WatchZonePatch;
}>;


export type UpdateWatchZoneMutation = { updateWatchZone: { zone: { id: string, name: string } | null, errors: Array<{ field: string, message: string }> } };

export type DeleteWatchZoneMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteWatchZoneMutation = { deleteWatchZone: { id: string, deleted: boolean } };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const RunFieldsFragmentDoc = new TypedDocumentString(`
    fragment RunFields on IngestRun {
  id
  mode
  triggeredBy
  status
  progress
  message
  recordsFetched
  recordsUpserted
  totalRecords
  warnings
  error
  startedAt
  finishedAt
  durationMs
  host
  source {
    id
    name
  }
}
    `, {"fragmentName":"RunFields"}) as unknown as TypedDocumentString<RunFieldsFragment, unknown>;
export const LiveQuakesDocument = new TypedDocumentString(`
    subscription LiveQuakes($min: Float) {
  earthquakeDetected(minMagnitude: $min) {
    id
    magnitude
    place
  }
}
    `) as unknown as TypedDocumentString<LiveQuakesSubscription, LiveQuakesSubscriptionVariables>;
export const CountryDetailDocument = new TypedDocumentString(`
    query CountryDetail($code: ID!) {
  country(code: $code) {
    code
    isoAlpha2
    name
    officialName
    localizedName(lang: "rus")
    capital
    region
    subregion
    flag
    flagUrl
    population
    areaKm2
    density
    gdpPerCapita
    lifeExpectancy
    incomeLevel
    landlocked
    unMember
    independent
    callingCodes
    topLevelDomains
    location {
      latitude
      longitude
    }
    capitalLocation {
      latitude
      longitude
    }
    languages {
      code
      name
      countryCount
    }
    currencies {
      code
      name
      symbol
    }
    weather {
      temperatureC
      apparentTemperatureC
      humidity
      windSpeedKmh
      precipitationMm
      description
      isDay
      observedAt
    }
    indicators(fromYear: 2000) {
      indicator {
        id
        name
        unit
      }
      points {
        year
        value
      }
      latest {
        year
        value
      }
      changePct
    }
    neighbors {
      code
      name
      flag
      seismicStats {
        count
        maxMagnitude
      }
    }
    seismicStats {
      count
      avgMagnitude
      maxMagnitude
      avgDepthKm
      tsunamiCount
      lastAt
      strongest {
        id
        magnitude
        place
        time
      }
    }
    recentEarthquakes(first: 5) {
      id
      magnitude
      place
      time
      latitude
      longitude
    }
    hazardStats {
      count
      open
      avgDurationDays
      byCategory {
        count
        open
        category {
          id
          title
        }
      }
    }
    naturalEvents(first: 10) {
      totalCount
      nodes {
        id
        title
        status
        startedAt
        latitude
        longitude
        primaryCategory {
          id
          title
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<CountryDetailQuery, CountryDetailQueryVariables>;
export const CountryQuakesDocument = new TypedDocumentString(`
    query CountryQuakes($code: ID!, $first: Int, $after: String) {
  country(code: $code) {
    code
    earthquakes(
      first: $first
      after: $after
      sort: {field: MAGNITUDE, direction: DESC}
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        magnitude
        place
        time
        depthKm
      }
    }
  }
}
    `) as unknown as TypedDocumentString<CountryQuakesQuery, CountryQuakesQueryVariables>;
export const CountriesDocument = new TypedDocumentString(`
    query Countries($filter: CountryFilter, $sort: CountrySort, $limit: Int, $offset: Int) {
  countries(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
    total
    limit
    offset
    hasMore
    items {
      code
      name
      localizedName(lang: "rus")
      flag
      region
      subregion
      population
      gdpPerCapita
      lifeExpectancy
      density
      incomeLevel
      seismicStats {
        count
        maxMagnitude
      }
      hazardStats {
        count
        open
      }
    }
  }
}
    `) as unknown as TypedDocumentString<CountriesQuery, CountriesQueryVariables>;
export const CountryFacetsDocument = new TypedDocumentString(`
    query CountryFacets {
  regions {
    name
    countryCount
    subregions
  }
  incomeLevels
}
    `) as unknown as TypedDocumentString<CountryFacetsQuery, CountryFacetsQueryVariables>;
export const EarthquakeDetailDocument = new TypedDocumentString(`
    query EarthquakeDetail($id: ID!, $radiusKm: Float!) {
  earthquake(id: $id) {
    id
    time
    updatedAt
    magnitude
    magnitudeType
    depthKm
    latitude
    longitude
    place
    type
    status
    tsunami
    alert
    felt
    cdi
    mmi
    significance
    network
    url
    severity
    energyJoules
    country {
      code
      name
      localizedName(lang: "rus")
      flag
      capital
      population
      region
      weather {
        temperatureC
        description
      }
      seismicStats {
        count
        maxMagnitude
      }
    }
    nearby(radiusKm: $radiusKm, first: 8) {
      id
      magnitude
      place
      time
      latitude
      longitude
    }
    aftershocks(radiusKm: $radiusKm, hours: 168, first: 15) {
      id
      magnitude
      place
      time
      latitude
      longitude
    }
  }
}
    `) as unknown as TypedDocumentString<EarthquakeDetailQuery, EarthquakeDetailQueryVariables>;
export const EarthquakesDocument = new TypedDocumentString(`
    query Earthquakes($filter: EarthquakeFilter, $sort: EarthquakeSort, $first: Int, $after: String) {
  earthquakes(filter: $filter, sort: $sort, first: $first, after: $after) {
    totalCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      time
      magnitude
      magnitudeType
      depthKm
      latitude
      longitude
      place
      severity
      alert
      tsunami
      felt
      significance
      country {
        code
        name
        flag
      }
    }
  }
}
    `) as unknown as TypedDocumentString<EarthquakesQuery, EarthquakesQueryVariables>;
export const NaturalEventDetailDocument = new TypedDocumentString(`
    query NaturalEventDetail($id: ID!) {
  naturalEvent(id: $id) {
    id
    title
    description
    link
    status
    startedAt
    lastObservedAt
    closedAt
    durationDays
    latitude
    longitude
    pointCount
    magnitude {
      value
      unit
    }
    primaryCategory {
      id
      title
    }
    categories {
      id
      title
      description
    }
    sources {
      url
      source {
        id
        title
      }
    }
    track(first: 100) {
      observedAt
      latitude
      longitude
      geometryType
      magnitude {
        value
        unit
      }
    }
    country {
      code
      name
      flag
      localizedName
      region
    }
    related(radiusKm: 300, first: 6) {
      id
      title
      startedAt
      status
      primaryCategory {
        id
        title
      }
    }
    nearbyEarthquakes(radiusKm: 250, days: 30, first: 10) {
      id
      magnitude
      place
      time
      depthKm
    }
  }
}
    `) as unknown as TypedDocumentString<NaturalEventDetailQuery, NaturalEventDetailQueryVariables>;
export const NaturalEventsDocument = new TypedDocumentString(`
    query NaturalEvents($filter: NaturalEventFilter, $sort: NaturalEventSort, $first: Int, $after: String) {
  naturalEvents(filter: $filter, sort: $sort, first: $first, after: $after) {
    totalCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      title
      status
      startedAt
      lastObservedAt
      durationDays
      latitude
      longitude
      pointCount
      magnitude {
        value
        unit
      }
      primaryCategory {
        id
        title
      }
      country {
        code
        name
        flag
      }
    }
  }
  hazardStats(filter: $filter) {
    count
    open
    byCategory {
      count
      open
      category {
        id
        title
      }
    }
  }
}
    `) as unknown as TypedDocumentString<NaturalEventsQuery, NaturalEventsQueryVariables>;
export const HazardCategoriesDocument = new TypedDocumentString(`
    query HazardCategories {
  hazardCategories {
    id
    title
  }
}
    `) as unknown as TypedDocumentString<HazardCategoriesQuery, HazardCategoriesQueryVariables>;
export const DashboardDocument = new TypedDocumentString(`
    query Dashboard($since: DateTime!, $yearAgo: DateTime!) {
  totalRecords
  dataSources {
    id
    name
    health
    recordCount
  }
  allQuakes: earthquakeStats {
    count
    maxMagnitude
    lastAt
  }
  recentStats: earthquakeStats(filter: {time: {from: $since}}) {
    count
    avgMagnitude
    tsunamiCount
    totalEnergyJoules
    strongest {
      id
      magnitude
      place
      time
    }
  }
  timeline: earthquakeTimeline(filter: {time: {from: $yearAgo}}, bucket: WEEK) {
    bucket
    count
    maxMagnitude
  }
  magnitudeHistogram(filter: {time: {from: $yearAgo}}) {
    from
    count
  }
  topSeismicCountries(filter: {time: {from: $yearAgo}}, limit: 8) {
    count
    maxMagnitude
    country {
      code
      name
      flag
      population
    }
  }
  hazardStats {
    count
    open
    byCategory {
      count
      open
      category {
        id
        title
      }
    }
  }
  strongQuakes: earthquakes(
    filter: {magnitude: {min: 5.5}, time: {from: $since}}
    sort: {field: TIME, direction: DESC}
    first: 60
  ) {
    nodes {
      id
      magnitude
      place
      time
      latitude
      longitude
      country {
        code
        flag
      }
    }
  }
  openEvents: naturalEvents(
    filter: {status: OPEN}
    sort: {field: LAST_OBSERVED_AT, direction: DESC}
    first: 6
  ) {
    totalCount
    nodes {
      id
      title
      lastObservedAt
      primaryCategory {
        title
      }
      country {
        code
        flag
      }
    }
  }
  countries(limit: 1) {
    total
  }
}
    `) as unknown as TypedDocumentString<DashboardQuery, DashboardQueryVariables>;
export const DashboardLiveFeedDocument = new TypedDocumentString(`
    subscription DashboardLiveFeed {
  earthquakeDetected(minMagnitude: 2.5) {
    id
    magnitude
    place
    time
    country {
      flag
    }
  }
}
    `) as unknown as TypedDocumentString<DashboardLiveFeedSubscription, DashboardLiveFeedSubscriptionVariables>;
export const OpsOverviewDocument = new TypedDocumentString(`
    query OpsOverview {
  totalRecords
  dataSources {
    id
    name
    description
    homepage
    service
    refreshInterval
    health
    recordCount
    lastSuccessAt
    lastRun {
      ...RunFields
    }
  }
  systemStatus {
    name
    url
    up
    latencyMs
    detail
  }
}
    fragment RunFields on IngestRun {
  id
  mode
  triggeredBy
  status
  progress
  message
  recordsFetched
  recordsUpserted
  totalRecords
  warnings
  error
  startedAt
  finishedAt
  durationMs
  host
  source {
    id
    name
  }
}`) as unknown as TypedDocumentString<OpsOverviewQuery, OpsOverviewQueryVariables>;
export const OpsRunsDocument = new TypedDocumentString(`
    query OpsRuns($status: IngestStatus, $source: ID, $first: Int, $after: String) {
  ingestRuns(status: $status, source: $source, first: $first, after: $after) {
    totalCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ...RunFields
    }
  }
}
    fragment RunFields on IngestRun {
  id
  mode
  triggeredBy
  status
  progress
  message
  recordsFetched
  recordsUpserted
  totalRecords
  warnings
  error
  startedAt
  finishedAt
  durationMs
  host
  source {
    id
    name
  }
}`) as unknown as TypedDocumentString<OpsRunsQuery, OpsRunsQueryVariables>;
export const TriggerIngestDocument = new TypedDocumentString(`
    mutation TriggerIngest($source: ID!, $mode: IngestMode) {
  triggerIngest(source: $source, mode: $mode) {
    accepted
    runId
    message
  }
}
    `) as unknown as TypedDocumentString<TriggerIngestMutation, TriggerIngestMutationVariables>;
export const IngestRunUpdatesDocument = new TypedDocumentString(`
    subscription IngestRunUpdates {
  ingestRunUpdated {
    ...RunFields
  }
}
    fragment RunFields on IngestRun {
  id
  mode
  triggeredBy
  status
  progress
  message
  recordsFetched
  recordsUpserted
  totalRecords
  warnings
  error
  startedAt
  finishedAt
  durationMs
  host
  source {
    id
    name
  }
}`) as unknown as TypedDocumentString<IngestRunUpdatesSubscription, IngestRunUpdatesSubscriptionVariables>;
export const WatchZonesDocument = new TypedDocumentString(`
    query WatchZones($days: Int!) {
  watchZones {
    id
    name
    description
    latitude
    longitude
    radiusKm
    minMagnitude
    color
    createdAt
    updatedAt
    earthquakeCount(days: $days)
    naturalEventCount(days: $days)
    earthquakes(first: 5, days: $days) {
      id
      magnitude
      place
      time
    }
    naturalEvents(first: 3, days: $days) {
      id
      title
      status
      lastObservedAt
      primaryCategory {
        title
      }
    }
  }
}
    `) as unknown as TypedDocumentString<WatchZonesQuery, WatchZonesQueryVariables>;
export const CreateWatchZoneDocument = new TypedDocumentString(`
    mutation CreateWatchZone($input: WatchZoneInput!) {
  createWatchZone(input: $input) {
    zone {
      id
      name
    }
    errors {
      field
      message
    }
  }
}
    `) as unknown as TypedDocumentString<CreateWatchZoneMutation, CreateWatchZoneMutationVariables>;
export const UpdateWatchZoneDocument = new TypedDocumentString(`
    mutation UpdateWatchZone($id: ID!, $patch: WatchZonePatch!) {
  updateWatchZone(id: $id, patch: $patch) {
    zone {
      id
      name
    }
    errors {
      field
      message
    }
  }
}
    `) as unknown as TypedDocumentString<UpdateWatchZoneMutation, UpdateWatchZoneMutationVariables>;
export const DeleteWatchZoneDocument = new TypedDocumentString(`
    mutation DeleteWatchZone($id: ID!) {
  deleteWatchZone(id: $id) {
    id
    deleted
  }
}
    `) as unknown as TypedDocumentString<DeleteWatchZoneMutation, DeleteWatchZoneMutationVariables>;