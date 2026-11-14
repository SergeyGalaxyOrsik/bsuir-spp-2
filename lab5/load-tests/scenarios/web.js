// SSR web scenario: a few VUs load server-rendered pages of the TanStack Start app.
// Every page render runs the route loader on the server, which queries the gateway.
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";
import { WEB_URL, thinkMs } from "../lib/config.js";
import { think } from "../lib/journeys.js";

const ssr = new Trend("ssr_page_duration", true);

export const options = {
  scenarios: {
    browsers: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "10s", target: Number(__ENV.PEAK_VUS || 5) },
        { duration: "30s", target: Number(__ENV.PEAK_VUS || 5) },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{expected_response:true}": ["p(95)<2000"],
    "ssr_page_duration{page:dashboard}": ["p(95)<2500"],
    "ssr_page_duration{page:earthquakes}": ["p(95)<2000"],
    "ssr_page_duration{page:earthquakes_filtered}": ["p(95)<2000"],
    "ssr_page_duration{page:countries}": ["p(95)<2000"],
    "ssr_page_duration{page:country}": ["p(95)<2500"],
    "ssr_page_duration{page:events}": ["p(95)<2000"],
  },
};

const COUNTRIES = ["JPN", "USA", "IDN", "CHL", "ITA", "TUR", "MEX", "NZL"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const pages = [
  ["dashboard", () => "/"],
  ["earthquakes", () => "/earthquakes"],
  ["earthquakes_filtered", () => `/earthquakes?minMag=${pick([4, 4.5, 5, 5.5, 6])}&period=${pick(["30d", "90d", "1y"])}`],
  ["countries", () => "/countries"],
  ["country", () => `/countries/${pick(COUNTRIES)}`],
  ["events", () => "/events"],
];

const T = thinkMs(1000);

export default function () {
  for (const [page, path] of pages) {
    const res = http.get(WEB_URL + path(), { tags: { name: page, page }, headers: { accept: "text/html" } });
    ssr.add(res.timings.duration, { page });
    check(res, {
      [`${page}: status 200`]: (r) => r.status === 200,
      [`${page}: rendered html`]: (r) => typeof r.body === "string" && r.body.includes("GeoPulse"),
      [`${page}: no SSR error`]: (r) => typeof r.body === "string" && !/Something went wrong|Часть данных недоступна/.test(r.body),
    });
    think(T);
  }
}
