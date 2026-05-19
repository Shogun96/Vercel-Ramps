-- Run once in Supabase SQL Editor.
-- This creates the movement history table used by the Warehouse Ramp Status app.

create extension if not exists pgcrypto;

create table if not exists public.ramp_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  ramp_number integer null,
  previous_status text null,
  new_status text null,
  previous_truck text null,
  new_truck text null,
  previous_trailer text null,
  new_trailer text null,
  truck text null,
  trailer text null,
  changed_field text null,
  source text null,
  device_id text null,
  notes text null
);

create index if not exists ramp_movements_created_at_idx
  on public.ramp_movements (created_at desc);

create index if not exists ramp_movements_ramp_number_idx
  on public.ramp_movements (ramp_number);

create index if not exists ramp_movements_truck_idx
  on public.ramp_movements (truck);

create index if not exists ramp_movements_trailer_idx
  on public.ramp_movements (trailer);

alter table public.ramp_movements enable row level security;

-- For this internal status app, authenticated/anon clients can read and insert movements.
-- Tighten these policies if this app becomes public.
drop policy if exists "Allow read ramp movements" on public.ramp_movements;
create policy "Allow read ramp movements"
  on public.ramp_movements
  for select
  using (true);

drop policy if exists "Allow insert ramp movements" on public.ramp_movements;
create policy "Allow insert ramp movements"
  on public.ramp_movements
  for insert
  with check (true);


-- Real-time ramp status table.
-- Required for online sync across all devices.
create table if not exists public.warehouse_status (
  ramp_number integer primary key,
  active boolean not null default false,
  red boolean not null default false,
  yellow boolean not null default false,
  input_value text not null default '',
  truck_value text not null default '',
  trailer_value text not null default '',
  has_truck boolean not null default false,
  is_exiting boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_status_updated_at_idx
  on public.warehouse_status (updated_at desc);

alter table public.warehouse_status enable row level security;

drop policy if exists "Allow read warehouse status" on public.warehouse_status;
create policy "Allow read warehouse status"
  on public.warehouse_status
  for select
  using (true);

drop policy if exists "Allow insert warehouse status" on public.warehouse_status;
create policy "Allow insert warehouse status"
  on public.warehouse_status
  for insert
  with check (true);

drop policy if exists "Allow update warehouse status" on public.warehouse_status;
create policy "Allow update warehouse status"
  on public.warehouse_status
  for update
  using (true)
  with check (true);

-- Optional seed rows for all ramps used by the app.
insert into public.warehouse_status (ramp_number)
select generate_series(20, 60)
on conflict (ramp_number) do nothing;

-- Make sure Realtime can publish changes from these tables.
-- These DO blocks are safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'warehouse_status'
  ) then
    alter publication supabase_realtime add table public.warehouse_status;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'ramp_movements'
  ) then
    alter publication supabase_realtime add table public.ramp_movements;
  end if;
end $$;
