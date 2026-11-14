create extension if not exists pg_trgm;
create extension if not exists cube;
create extension if not exists earthdistance;

create table seismic.earthquakes (
  id text primary key,
  time timestamptz not null,
  updated_at timestamptz not null,
  magnitude double precision,
  magnitude_type text,
  depth_km double precision,
  latitude double precision not null,
  longitude double precision not null,
  place text,
  type text not null,
  status text,
  tsunami boolean not null default false,
  alert text,
  felt integer,
  cdi double precision,
  mmi double precision,
  significance integer,
  network text,
  url text,
  country_code text,
  ingested_at timestamptz not null default now()
);

-- Keyset pagination indexes: one per sortable expression, id as the tie-breaker.
create index earthquakes_time_idx on seismic.earthquakes (time, id);
create index earthquakes_mag_idx on seismic.earthquakes ((coalesce(magnitude, -10)), id);
create index earthquakes_depth_idx on seismic.earthquakes ((coalesce(depth_km, -1000)), id);
create index earthquakes_sig_idx on seismic.earthquakes ((coalesce(significance, 0)), id);
create index earthquakes_felt_idx on seismic.earthquakes ((coalesce(felt, 0)), id);
create index earthquakes_country_time_idx on seismic.earthquakes (country_code, time desc);
create index earthquakes_place_trgm_idx on seismic.earthquakes using gin (place gin_trgm_ops);
create index earthquakes_geo_idx on seismic.earthquakes using gist (ll_to_earth(latitude, longitude));
create index earthquakes_alert_idx on seismic.earthquakes (alert) where alert is not null;
