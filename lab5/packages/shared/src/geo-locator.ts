import { CircuitBreaker, fetchJson } from "./http.ts";
import type { Logger } from "./logger.ts";

const NATURAL_EARTH_URL =
  process.env.NATURAL_EARTH_URL ??
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

type Ring = [number, number][];
type Polygon = Ring[];

interface Shape {
  code: string;
  bbox: [number, number, number, number];
  polygons: Polygon[];
}

interface Feature {
  properties: Record<string, string | number | null>;
  geometry: { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] } | null;
}

// Natural Earth uses a few codes that differ from the ISO-based codes in mledoze/countries.
const CODE_FIXES: Record<string, string> = { KOS: "UNK", SDS: "SSD", SOL: "SOM", CYN: "CYP", SAH: "ESH", PSX: "PSE" };

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
  "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
  "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA",
  "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
];

const NAME_ALIASES: Record<string, string> = {
  "u.s. virgin islands": "VIR",
  "puerto rico": "PRI",
  "b.c., mx": "MEX",
  "baja california": "MEX",
  "mx": "MEX",
  "russia": "RUS",
  "south korea": "KOR",
  "north korea": "PRK",
  "taiwan": "TWN",
  "iran": "IRN",
  "syria": "SYR",
  "vietnam": "VNM",
  "laos": "LAO",
  "bolivia": "BOL",
  "venezuela": "VEN",
  "tanzania": "TZA",
  "democratic republic of the congo": "COD",
  "congo": "COG",
  "east timor": "TLS",
  "timor leste": "TLS",
  "micronesia": "FSM",
  "wallis and futuna": "WLF",
  "fiji": "FJI",
  "tonga": "TON",
  "vanuatu": "VUT",
  "samoa": "WSM",
  "american samoa": "ASM",
  "papua new guinea": "PNG",
  "solomon islands": "SLB",
  "new caledonia": "NCL",
  "northern mariana islands": "MNP",
  "guam": "GUM",
  "kermadec islands": "NZL",
  "philippines": "PHL",
  "japan": "JPN",
  "indonesia": "IDN",
};

function ringContains(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(polygon: Polygon, x: number, y: number): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !ringContains(outer, x, y)) return false;
  return !holes.some((hole) => ringContains(hole, x, y));
}

/** Maps coordinates (or a USGS-style place string) to an ISO alpha-3 country code. */
export class CountryLocator {
  private constructor(
    private readonly shapes: Shape[],
    private readonly names: Map<string, string>,
  ) {}

  static async load(log: Logger): Promise<CountryLocator> {
    const data = await fetchJson<{ features: Feature[] }>(NATURAL_EARTH_URL, {
      source: "natural-earth",
      log,
      timeoutMs: 60_000,
      breaker: new CircuitBreaker("natural-earth", 3, 60_000),
    });
    const shapes: Shape[] = [];
    const names = new Map<string, string>();
    for (const feature of data.features) {
      const p = feature.properties;
      let code = [p.ISO_A3_EH, p.ISO_A3, p.ADM0_A3].find((c) => typeof c === "string" && c !== "-99") as string | undefined;
      if (!code || !feature.geometry) continue;
      code = CODE_FIXES[code] ?? code;
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      const bbox: Shape["bbox"] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const polygon of polygons) {
        for (const [x, y] of polygon[0] ?? []) {
          bbox[0] = Math.min(bbox[0], x);
          bbox[1] = Math.min(bbox[1], y);
          bbox[2] = Math.max(bbox[2], x);
          bbox[3] = Math.max(bbox[3], y);
        }
      }
      shapes.push({ code, bbox, polygons });
      for (const key of ["NAME", "NAME_LONG", "ADMIN", "NAME_EN", "FORMAL_EN"]) {
        const name = p[key];
        if (typeof name === "string") names.set(name.toLowerCase(), code);
      }
    }
    for (const state of US_STATES) names.set(state.toLowerCase(), "USA");
    for (const [name, code] of Object.entries(NAME_ALIASES)) names.set(name, code);
    log.info({ shapes: shapes.length }, "country locator loaded");
    return new CountryLocator(shapes, names);
  }

  locatePoint(lon: number, lat: number): string | null {
    for (const shape of this.shapes) {
      const [minX, minY, maxX, maxY] = shape.bbox;
      if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
      if (shape.polygons.some((polygon) => polygonContains(polygon, lon, lat))) return shape.code;
    }
    return null;
  }

  locateName(place: string | null | undefined): string | null {
    if (!place) return null;
    const tail = place.split(",").at(-1)?.trim().toLowerCase();
    if (tail && this.names.has(tail)) return this.names.get(tail)!;
    const lower = place.toLowerCase();
    for (const [name, code] of this.names) {
      if (name.length > 4 && lower.endsWith(name)) return code;
    }
    return null;
  }

  locate(lon: number, lat: number, place?: string | null): string | null {
    return this.locatePoint(lon, lat) ?? this.locateName(place);
  }
}
