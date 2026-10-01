-- האימון שלי (workout/): חיבור בין הטלפון של הילד לטלפון של רועי.
-- טבלה אחת של "אירועים משפחתיים": אימון שהילד סיים, ורשומות של יומן הכדורסל של רועי.
-- הגישה היא עם המפתח הציבורי (anon) ובלי התחברות, לפי קוד משפחה סודי (8 תווים אקראיים) שמוקלד פעם אחת בכל טלפון.
-- אחרי הביקורת (01/10/2026): הקוד נבדק בשרת. אין גישה ישירה לטבלה: רק פונקציות (RPC) שמקבלות את הקוד כפרמטר,
-- משוות את הגיבוב שלו לטבלת families, ורק אז קוראות או כותבות. מריצים פעם אחת ב-Supabase → SQL Editor → Run.

create extension if not exists pgcrypto;

create table if not exists family_events (
  id text primary key,
  family_code text not null,
  kind text not null,                 -- workout | basketball
  payload jsonb not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists family_events_code on family_events (family_code, kind, created desc);

-- המשפחות: רק גיבוב של הקוד נשמר. הקוד עצמו נשאר בטלפונים.
create table if not exists families (
  code_hash text primary key,
  created timestamptz not null default now()
);
alter table families enable row level security;
alter table family_events enable row level security;
-- אין מדיניות לאף תפקיד: הטבלאות סגורות לגישה ישירה. הכול דרך הפונקציות למטה (security definer).
drop policy if exists family_anon_select on family_events;
drop policy if exists family_anon_insert on family_events;
drop policy if exists family_anon_update on family_events;
drop policy if exists family_anon_delete on family_events;
revoke all on family_events from anon, authenticated;
revoke all on families from anon, authenticated;

create or replace function family_hash(code text) returns text language sql immutable as $$
  select encode(digest(upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;
create or replace function family_norm(code text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
-- קוד תקין = 8-12 תווים ורשום בטבלה
create or replace function family_known(code text) returns boolean language sql stable security definer set search_path = public as $$
  select length(family_norm(code)) between 8 and 12 and exists (select 1 from families f where f.code_hash = family_hash(code));
$$;
-- רישום משפחה: הטלפון הראשון יוצר קוד אקראי ורושם אותו (רק הגיבוב). קוד קיים נשאר כמו שהוא.
create or replace function family_register(code text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if length(family_norm(code)) < 8 or length(family_norm(code)) > 12 then return false; end if;
  insert into families (code_hash) values (family_hash(code)) on conflict do nothing;
  return true;
end $$;
-- כתיבה (upsert) של אירועים: רק עם קוד רשום, רק kind מוכר, ורק לשורות של אותו קוד
create or replace function family_push(code text, rows jsonb) returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb;
begin
  if not family_known(code) then raise exception 'unknown family code' using errcode = '28000'; end if;
  for r in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) loop
    if (r->>'kind') not in ('workout', 'basketball') or coalesce(r->>'id', '') = '' then continue; end if;
    insert into family_events (id, family_code, kind, payload) values (r->>'id', family_norm(code), r->>'kind', coalesce(r->'payload', '{}'::jsonb))
      on conflict (id) do update set payload = excluded.payload, updated = now() where family_events.family_code = family_norm(code);
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function family_list(code text, kind text, lim integer default 200)
returns table (id text, payload jsonb, created timestamptz, updated timestamptz) language plpgsql stable security definer set search_path = public as $$
begin
  if not family_known(code) then raise exception 'unknown family code' using errcode = '28000'; end if;
  return query select e.id, e.payload, e.created, e.updated from family_events e
    where e.family_code = family_norm(code) and e.kind = family_list.kind order by e.created desc limit greatest(1, least(coalesce(lim, 200), 500));
end $$;
create or replace function family_remove(code text, id text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not family_known(code) then raise exception 'unknown family code' using errcode = '28000'; end if;
  delete from family_events e where e.id = family_remove.id and e.family_code = family_norm(code) and e.kind = 'basketball';
  return found;
end $$;
grant execute on function family_register(text), family_known(text), family_push(text, jsonb), family_list(text, text, integer), family_remove(text, text) to anon, authenticated;

drop trigger if exists family_touch on family_events;
create trigger family_touch before update on family_events for each row execute function touch_updated();
select 'family ok' as status;
