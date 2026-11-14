// Smoke: 1 VU for ~30 s walks every page of the UI once per iteration.
// Goal: all operations answer without errors before running heavier scenarios.
import { baseThresholds, thinkMs } from "../lib/config.js";
import { countries, countryDetail, dashboard, earthquakes, events, think } from "../lib/journeys.js";

export const options = {
  vus: 1,
  duration: __ENV.DURATION || "30s",
  thresholds: {
    ...baseThresholds,
    http_req_failed: ["rate==0"],
    gql_errors: ["rate==0"],
    "http_req_duration{expected_response:true}": ["p(95)<1500"],
  },
};

const T = thinkMs(500);

export default function () {
  dashboard();
  think(T);
  earthquakes(T);
  think(T);
  countryDetail(T);
  think(T);
  events(T);
  think(T);
  countries(T);
  think(T);
}
