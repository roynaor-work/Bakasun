-- באקה סאן · מסד הנתונים בענן (Supabase / Postgres). שלב 0 של תוכנית השלבים.
-- כל טבלה שייכת ל"עסק" (org) כדי שבעתיד כמה עסקים יוכלו להשתמש באותה מערכת בנפרד.
-- העמודות תואמות אחד לאחד לשדות שהאפליקציה שומרת היום במכשיר.

create extension if not exists pgcrypto;

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created timestamptz not null default now()
);
create table if not exists members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'producer',          -- producer | admin
  primary key (org_id, user_id)
);

-- A generic document table per collection keeps the app's records exactly as they are (JSON), with the few columns we sort and filter by.
create table if not exists docs (
  id text not null,
  org_id uuid not null references orgs(id) on delete cascade,
  col text not null,                               -- cases | clients | calls | tasks | quotes | suppliers | links | schedule | staff | payments | checks
  data jsonb not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (org_id, col, id)
);
create index if not exists docs_col_updated on docs (org_id, col, updated desc);
create index if not exists docs_data_gin on docs using gin (data jsonb_path_ops);

create table if not exists settings (
  org_id uuid not null references orgs(id) on delete cascade,
  key text not null,
  value text,
  primary key (org_id, key)
);

-- Row-level security: a user sees only the orgs they are a member of.
alter table orgs enable row level security;
alter table members enable row level security;
alter table docs enable row level security;
alter table settings enable row level security;

create or replace function my_orgs() returns setof uuid language sql stable security definer as $$
  select org_id from members where user_id = auth.uid()
$$;

create policy orgs_read on orgs for select using (id in (select my_orgs()));
create policy members_read on members for select using (org_id in (select my_orgs()));
create policy docs_all on docs for all using (org_id in (select my_orgs())) with check (org_id in (select my_orgs()));
create policy settings_all on settings for all using (org_id in (select my_orgs())) with check (org_id in (select my_orgs()));

-- updated is set by the server, never trusted from the client
create or replace function touch_updated() returns trigger language plpgsql as $$
begin new.updated = now(); return new; end $$;
drop trigger if exists docs_touch on docs;
create trigger docs_touch before update on docs for each row execute function touch_updated();
