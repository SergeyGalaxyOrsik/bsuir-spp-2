create table ops.watch_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_km double precision not null check (radius_km > 0 and radius_km <= 5000),
  min_magnitude double precision not null default 4 check (min_magnitude between 0 and 10),
  color text not null default '#f97316',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into ops.watch_zones (name, description, latitude, longitude, radius_km, min_magnitude, color) values
  ('Tokyo metropolitan area', 'Kanto plain and Sagami trough', 35.68, 139.69, 300, 4, '#ef4444'),
  ('San Andreas fault', 'Central and Southern California', 35.5, -119.5, 450, 3.5, '#f97316'),
  ('Kamchatka', 'Kuril-Kamchatka subduction zone', 54.5, 159.5, 600, 4.5, '#8b5cf6'),
  ('Reykjanes peninsula', 'Volcanic and seismic activity in SW Iceland', 63.9, -22.3, 150, 2.5, '#06b6d4'),
  ('Central Chile', 'Nazca plate subduction', -33.4, -71.6, 500, 4.5, '#22c55e');
