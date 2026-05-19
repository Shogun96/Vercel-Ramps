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
