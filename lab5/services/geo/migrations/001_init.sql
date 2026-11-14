create extension if not exists pg_trgm;

create table geo.countries (
  code text primary key,
  iso2 text not null,
  ccn3 text,
  name text not null,
  official_name text not null,
  name_ru text,
  translations jsonb not null default '{}',
  capital text,
  region text not null,
  subregion text,
  latitude double precision,
  longitude double precision,
  area_km2 double precision,
  landlocked boolean not null default false,
  independent boolean,
  un_member boolean not null default false,
  flag text,
  tld text[] not null default '{}',
  calling_codes text[] not null default '{}',
  borders text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index countries_name_trgm_idx on geo.countries using gin (name gin_trgm_ops);
create index countries_region_idx on geo.countries (region, subregion);

create table geo.languages (code text primary key, name text not null);
create table geo.country_languages (
  country_code text not null references geo.countries (code) on delete cascade,
  language_code text not null references geo.languages (code) on delete cascade,
  primary key (country_code, language_code)
);
create index country_languages_lang_idx on geo.country_languages (language_code);

create table geo.currencies (code text primary key, name text not null, symbol text);
create table geo.country_currencies (
  country_code text not null references geo.countries (code) on delete cascade,
  currency_code text not null references geo.currencies (code) on delete cascade,
  primary key (country_code, currency_code)
);
create index country_currencies_cur_idx on geo.country_currencies (currency_code);

-- World Bank country metadata, owned by the worldbank collector.
create table geo.wb_countries (
  code text primary key,
  name text not null,
  is_aggregate boolean not null,
  region text,
  income_level text,
  lending_type text,
  capital text,
  capital_latitude double precision,
  capital_longitude double precision
);

create table geo.indicators (
  id text primary key,
  wb_code text not null unique,
  name text not null,
  unit text,
  description text
);

create table geo.indicator_values (
  country_code text not null,
  indicator_id text not null references geo.indicators (id),
  year smallint not null,
  value double precision,
  primary key (country_code, indicator_id, year)
);
create index indicator_values_ranking_idx on geo.indicator_values (indicator_id, year, value desc);

create table geo.weather (
  country_code text primary key,
  latitude double precision not null,
  longitude double precision not null,
  temperature_c double precision,
  apparent_temperature_c double precision,
  humidity double precision,
  wind_speed_kmh double precision,
  wind_direction double precision,
  precipitation_mm double precision,
  weather_code integer,
  is_day boolean,
  observed_at timestamptz not null
);

-- Denormalized, query-ready country facts; refreshed by collectors after each run.
create materialized view geo.country_facts as
select
  c.code,
  wb.income_level,
  wb.capital_latitude,
  wb.capital_longitude,
  (select v.value from geo.indicator_values v where v.country_code = c.code and v.indicator_id = 'POPULATION' and v.value is not null order by v.year desc limit 1) as population,
  (select v.value from geo.indicator_values v where v.country_code = c.code and v.indicator_id = 'GDP_PER_CAPITA' and v.value is not null order by v.year desc limit 1) as gdp_per_capita,
  (select v.value from geo.indicator_values v where v.country_code = c.code and v.indicator_id = 'LIFE_EXPECTANCY' and v.value is not null order by v.year desc limit 1) as life_expectancy
from geo.countries c
left join geo.wb_countries wb on wb.code = c.code;
create unique index country_facts_code_idx on geo.country_facts (code);
