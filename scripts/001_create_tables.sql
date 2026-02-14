-- ============================================================
-- Paula Guerendiain - Estetica Integral
-- Supabase Database Schema
-- ============================================================

-- 1. PROFILES TABLE
-- Extends auth.users with app-specific fields
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);
create index idx_profiles_email on public.profiles(email);

alter table public.profiles enable row level security;

-- Everyone can read profiles (needed for appointment lookups)
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- Users can update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Insert is handled by trigger (see below), but allow self-insert as fallback
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup (handles email/pass and Google OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', null),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      null
    ),
    coalesce(new.raw_user_meta_data ->> 'role', 'client')
  )
  on conflict (id) do update set
    full_name = coalesce(
      nullif(excluded.full_name, ''),
      public.profiles.full_name
    ),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- 2. TREATMENTS TABLE
-- ============================================================
create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_treatments_active on public.treatments(is_active);

alter table public.treatments enable row level security;

-- Everyone can read treatments (needed for booking)
create policy "treatments_select_all"
  on public.treatments for select
  using (true);

-- Only admins can insert/update/delete treatments
create policy "treatments_insert_admin"
  on public.treatments for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "treatments_update_admin"
  on public.treatments for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "treatments_delete_admin"
  on public.treatments for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- 3. APPOINTMENTS TABLE
-- ============================================================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointments_date on public.appointments(date);
create index idx_appointments_client on public.appointments(client_id);
create index idx_appointments_status on public.appointments(status);
create index idx_appointments_date_status on public.appointments(date, status);

alter table public.appointments enable row level security;

-- Admins can see all appointments; clients can see their own
create policy "appointments_select"
  on public.appointments for select
  using (
    auth.uid() = client_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Clients can insert their own appointments; admins can insert for anyone
create policy "appointments_insert"
  on public.appointments for insert
  with check (
    auth.uid() = client_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Clients can update their own; admins can update any
create policy "appointments_update"
  on public.appointments for update
  using (
    auth.uid() = client_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Only admins can delete
create policy "appointments_delete_admin"
  on public.appointments for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- 4. APPOINTMENT_TREATMENTS (junction table)
-- ============================================================
create table if not exists public.appointment_treatments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  unique(appointment_id, treatment_id)
);

create index idx_apt_treatments_appointment on public.appointment_treatments(appointment_id);
create index idx_apt_treatments_treatment on public.appointment_treatments(treatment_id);

alter table public.appointment_treatments enable row level security;

-- Same visibility as appointments
create policy "apt_treatments_select"
  on public.appointment_treatments for select
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id
      and (a.client_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

create policy "apt_treatments_insert"
  on public.appointment_treatments for insert
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id
      and (a.client_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

create policy "apt_treatments_delete"
  on public.appointment_treatments for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- 5. AVAILABILITY TABLE (weekly schedule)
-- ============================================================
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(day_of_week)
);

create index idx_availability_day on public.availability(day_of_week);

alter table public.availability enable row level security;

-- Everyone can read availability (needed for booking)
create policy "availability_select_all"
  on public.availability for select
  using (true);

-- Only admins can modify
create policy "availability_insert_admin"
  on public.availability for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "availability_update_admin"
  on public.availability for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- 6. AVAILABILITY_OVERRIDES TABLE (date-specific blocks)
-- ============================================================
create table if not exists public.availability_overrides (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time,
  end_time time,
  is_blocked boolean not null default true,
  reason text,
  blocked_slots text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_overrides_date on public.availability_overrides(date);
create index idx_overrides_blocked on public.availability_overrides(is_blocked);

alter table public.availability_overrides enable row level security;

-- Everyone can read overrides (needed for booking slot computation)
create policy "overrides_select_all"
  on public.availability_overrides for select
  using (true);

-- Only admins can modify
create policy "overrides_insert_admin"
  on public.availability_overrides for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "overrides_update_admin"
  on public.availability_overrides for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "overrides_delete_admin"
  on public.availability_overrides for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- 7. UPDATED_AT TRIGGER (auto-update timestamps)
-- ============================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger set_updated_at_treatments
  before update on public.treatments
  for each row execute function public.update_updated_at();

create trigger set_updated_at_appointments
  before update on public.appointments
  for each row execute function public.update_updated_at();


-- 8. HELPER VIEWS
-- ============================================================

-- Appointments with client + treatments joined
create or replace view public.appointments_with_details as
select
  a.*,
  p.full_name as client_name,
  p.email as client_email,
  p.phone as client_phone,
  coalesce(
    json_agg(
      json_build_object('id', t.id, 'name', t.name)
    ) filter (where t.id is not null),
    '[]'::json
  ) as treatments
from public.appointments a
left join public.profiles p on p.id = a.client_id
left join public.appointment_treatments at2 on at2.appointment_id = a.id
left join public.treatments t on t.id = at2.treatment_id
group by a.id, p.full_name, p.email, p.phone;
