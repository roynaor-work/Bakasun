-- האימון שלי (workout/): חיבור בין הטלפון של הילד לטלפון של רועי.
-- טבלה אחת של "אירועים משפחתיים": אימון שהילד סיים, ורשומות של יומן הכדורסל של רועי.
-- הגישה היא עם המפתח הציבורי (anon) ובלי התחברות, לפי קוד משפחה סודי (8 תווים אקראיים) שמוקלד פעם אחת בכל טלפון.
-- מריצים פעם אחת ב-Supabase → SQL Editor → New query → Run.

create table if not exists family_events (
  id text primary key,
  family_code text not null,
  kind text not null,                 -- workout | basketball
  payload jsonb not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists family_events_code on family_events (family_code, kind, created desc);

alter table family_events enable row level security;
drop policy if exists family_anon_select on family_events;
drop policy if exists family_anon_insert on family_events;
drop policy if exists family_anon_update on family_events;
drop policy if exists family_anon_delete on family_events;
-- מי שמכיר את קוד המשפחה (8 תווים אקראיים) קורא וכותב את השורות שלו. אין כאן מידע רגיש: אימונים של ילד ויומן כדורסל.
create policy family_anon_select on family_events for select to anon using (length(family_code) >= 8);
create policy family_anon_insert on family_events for insert to anon with check (length(family_code) >= 8 and kind in ('workout', 'basketball'));
create policy family_anon_update on family_events for update to anon using (length(family_code) >= 8) with check (length(family_code) >= 8);
create policy family_anon_delete on family_events for delete to anon using (length(family_code) >= 8 and kind = 'basketball');

drop trigger if exists family_touch on family_events;
create trigger family_touch before update on family_events for each row execute function touch_updated();
select 'family ok' as status;
