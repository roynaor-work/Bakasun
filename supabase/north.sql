-- הזמנות מחנות המארזים של הרוח הצפונית (north/). רועי מריץ פעם אחת ב-SQL Editor.
create table if not exists public.north_orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  order_no text not null unique,
  status text not null default 'new',          -- new / paid / ready / delivered / cancelled
  pay text not null,                            -- card / bit / cash
  method text not null,                         -- pickup / north
  total numeric(10,2) not null,
  customer jsonb not null,                      -- שם, טלפון, מייל, כתובת, הערות
  items jsonb not null,                         -- שורות ההזמנה
  totals jsonb not null,                        -- ביניים, משלוח, סה"כ
  ua text
);
alter table public.north_orders enable row level security;
-- הציבור (anon) רק מוסיף הזמנה חדשה. קריאה ועדכון: רק צוות החנות (מיילים בטבלה north_staff) מחשבון מחובר,
-- והשרת (service role, הפונקציות של Grow). משתמש מחובר אחר (למשל וירג'יני באפליקציית ההפקות) לא רואה כלום.
create table if not exists public.north_staff (email text primary key, note text);
alter table public.north_staff enable row level security;
-- את הרשימה מעדכנים רק מלוח הבקרה (אין מדיניות לאף תפקיד). רועי: insert into north_staff(email) values ('roynaor@gmail.com');
insert into public.north_staff (email, note) values ('roynaor@gmail.com', 'בעלים') on conflict (email) do nothing;
create or replace function public.north_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.north_staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
drop policy if exists "north insert" on public.north_orders;
create policy "north insert" on public.north_orders for insert to anon
  with check (status = 'new' and grow_process_id is null and grow_transaction_id is null and paid_at is null);
drop policy if exists "north read auth" on public.north_orders;
create policy "north read auth" on public.north_orders for select to authenticated using (public.north_is_staff());
drop policy if exists "north update auth" on public.north_orders;
create policy "north update auth" on public.north_orders for update to authenticated using (public.north_is_staff()) with check (public.north_is_staff());
create index if not exists north_orders_created on public.north_orders (created_at desc);

-- שאלון הספק (north/survey.html): מה יש למתן קבוע ומה הוא יכול להחזיק. anon מוסיף בלבד.
create table if not exists public.north_survey (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  who text,
  answers jsonb not null
);
alter table public.north_survey enable row level security;
drop policy if exists "survey insert" on public.north_survey;
create policy "survey insert" on public.north_survey for insert to anon with check (true);
drop policy if exists "survey read auth" on public.north_survey;
create policy "survey read auth" on public.north_survey for select to authenticated using (public.north_is_staff());

-- Grow: מזהי תהליך התשלום ופרטי העסקה (supabase/functions/grow-pay, grow-notify).
alter table public.north_orders add column if not exists grow_process_id text;
alter table public.north_orders add column if not exists grow_process_token text;
alter table public.north_orders add column if not exists grow_transaction_id text;
alter table public.north_orders add column if not exists paid_at timestamptz;
alter table public.north_orders add column if not exists pay_details jsonb;
create index if not exists north_orders_grow_process on public.north_orders (grow_process_id);
-- הפונקציות של Grow (grow-pay, grow-notify) כותבות עם service role; הסטטוס 'paid' נכתב רק אחרי אימות מול Grow.
select 'north ok' as status;
