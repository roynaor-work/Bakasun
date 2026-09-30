-- הזמנות מחנות המארזים של הרוח הצפונית (north/). רועי מריץ פעם אחת ב-SQL Editor.
create table if not exists public.north_orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  order_no text not null unique,
  status text not null default 'new',          -- new / paid / ready / delivered / cancelled
  pay text not null,                            -- card / bit / cash
  method text not null,                         -- pickup / north / national
  total numeric(10,2) not null,
  customer jsonb not null,                      -- שם, טלפון, מייל, כתובת, הערות
  items jsonb not null,                         -- שורות ההזמנה
  totals jsonb not null,                        -- ביניים, משלוח, סה"כ
  ua text
);
alter table public.north_orders enable row level security;
-- הציבור (anon) רק מוסיף. קריאה ועדכון רק מלוח הבקרה של Supabase או מחשבון מחובר.
drop policy if exists "north insert" on public.north_orders;
create policy "north insert" on public.north_orders for insert to anon with check (true);
drop policy if exists "north read auth" on public.north_orders;
create policy "north read auth" on public.north_orders for select to authenticated using (true);
drop policy if exists "north update auth" on public.north_orders;
create policy "north update auth" on public.north_orders for update to authenticated using (true);
create index if not exists north_orders_created on public.north_orders (created_at desc);
