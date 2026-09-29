create type user_role as enum ('user', 'moderator', 'admin');
create type user_status as enum ('active', 'blocked');
create type prompt_model as enum ('gpt', 'claude', 'gemini', 'other');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role user_role not null default 'user',
  status user_status not null default 'active',
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  refresh_hash text not null unique,
  previous_refresh_hash text,
  rotated_at timestamptz,
  user_agent text not null default '',
  ip text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_previous_refresh_hash_idx on sessions (previous_refresh_hash);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table prompts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  model prompt_model not null,
  tags text[] not null default '{}',
  attachment_name text,
  attachment_mime text,
  attachment_size integer,
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prompts_author_id_idx on prompts (author_id);
create index prompts_created_at_idx on prompts (created_at desc);
