-- ============================================================
-- Extra Slots: additional time slots for specific days of the week
-- that fall outside the normal availability range.
-- Example: Friday 19:30 slot outside the regular 09:00-14:00 range.
-- ============================================================

create table if not exists public.availability_extra_slots (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  time_slot time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(day_of_week, time_slot)
);

create index idx_extra_slots_day on public.availability_extra_slots(day_of_week);

alter table public.availability_extra_slots enable row level security;

-- Everyone can read (needed for booking)
create policy "extra_slots_select_all"
  on public.availability_extra_slots for select
  using (true);

-- Only admins can modify
create policy "extra_slots_insert_admin"
  on public.availability_extra_slots for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "extra_slots_update_admin"
  on public.availability_extra_slots for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "extra_slots_delete_admin"
  on public.availability_extra_slots for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Seed: Friday (5) at 19:30
insert into public.availability_extra_slots (day_of_week, time_slot, is_active) values
  (5, '19:30', true)
on conflict (day_of_week, time_slot) do nothing;
