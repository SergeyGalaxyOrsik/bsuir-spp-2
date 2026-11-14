-- Dashboard aggregates (timeline, histogram, top countries) over a time window become
-- index-only scans instead of heap scans.
drop index seismic.earthquakes_time_idx;
create index earthquakes_time_idx on seismic.earthquakes (time, id) include (magnitude, country_code);

-- Loose index scan for `earthquakeTypes` and the `types` filter.
create index earthquakes_type_idx on seismic.earthquakes (type);

-- Per-country "strongest" and `Country.earthquakes(sort: MAGNITUDE)`. Without it, the planner walks
-- earthquakes_mag_idx and filters by country, which reads the whole index for a quiet country.
create index earthquakes_country_mag_idx on seismic.earthquakes (country_code, (coalesce(magnitude, -10)), id);
