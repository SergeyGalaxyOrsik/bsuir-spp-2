create extension if not exists pg_trgm;
create extension if not exists cube;
create extension if not exists earthdistance;

create table hazards.categories (
  id text primary key,
  title text not null,
  description text
);

create table hazards.sources (
  id text primary key,
  title text not null,
  url text
);

create table hazards.events (
  id text primary key,
  title text not null,
  description text,
  link text,
  closed_at timestamptz,
  started_at timestamptz not null,
  last_observed_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  magnitude_value double precision,
  magnitude_unit text,
  primary_category_id text not null references hazards.categories (id),
  country_code text,
  point_count integer not null default 0,
  ingested_at timestamptz not null default now()
);
create index events_started_idx on hazards.events (started_at, id);
create index events_last_idx on hazards.events (last_observed_at, id);
create index events_mag_idx on hazards.events ((coalesce(magnitude_value, -1)), id);
create index events_title_sort_idx on hazards.events (lower(title), id);
create index events_duration_idx on hazards.events ((extract(epoch from (coalesce(closed_at, last_observed_at) - started_at))), id);
create index events_category_idx on hazards.events (primary_category_id, started_at desc);
create index events_country_idx on hazards.events (country_code, started_at desc);
create index events_open_idx on hazards.events (started_at desc) where closed_at is null;
create index events_title_trgm_idx on hazards.events using gin (title gin_trgm_ops);
create index events_geo_idx on hazards.events using gist (ll_to_earth(latitude, longitude));

create table hazards.event_categories (
  event_id text not null references hazards.events (id) on delete cascade,
  category_id text not null references hazards.categories (id),
  primary key (event_id, category_id)
);
create index event_categories_cat_idx on hazards.event_categories (category_id);

create table hazards.event_sources (
  event_id text not null references hazards.events (id) on delete cascade,
  source_id text not null references hazards.sources (id),
  url text,
  primary key (event_id, source_id)
);
create index event_sources_src_idx on hazards.event_sources (source_id);

create table hazards.event_points (
  event_id text not null references hazards.events (id) on delete cascade,
  seq integer not null,
  observed_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  geometry_type text not null,
  magnitude_value double precision,
  magnitude_unit text,
  primary key (event_id, seq)
);
