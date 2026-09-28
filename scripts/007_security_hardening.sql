-- ============================================================
-- Migration: security hardening
--
-- Run this whole file in the Supabase SQL Editor AFTER
-- 006_booking_availability.sql. It is safe to run again. It runs as one
-- transaction: if anything fails, nothing is changed.
--
-- The browser holds the public anon key and the user's session token, so
-- anyone can query the database directly, bypassing the app. The RLS rules
-- from 001..005 allowed:
--   1. Anyone (not logged in) to read every appointment with the client's
--      name, email, phone and notes (appointments_with_details view).
--   2. Anyone (not logged in) to read every profile (names, emails, phones).
--   3. Any logged-in patient to make herself admin (update her own role).
--   4. Anyone signing up with email/password to choose the admin role
--      (handle_new_user copied "role" from the signup data).
--   5. A new user without a profile to insert her own profile as admin.
--   6. Patients to change their own appointments (move them to a blocked or
--      taken slot, confirm a cancelled one again, mark them completed).
--   7. Patients to insert appointments directly, skipping every check.
--
-- After this file: profiles are visible to their owner and the admin only;
-- nobody can change a role through the API (the owner still can from the SQL
-- Editor); patients can only cancel their own confirmed appointments; and
-- appointments inserted directly get the same checks as the booking API.
-- The admin keeps full access. The last statement prints a status row.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Central admin predicate. SECURITY DEFINER so it reads profiles
--    WITHOUT triggering RLS on profiles (avoids recursion when a
--    profiles policy needs to know "is the caller an admin?").
--    STABLE + pinned search_path (Supabase hardening requirement).
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter function public.is_admin() owner to postgres;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 1. PROFILES: stop the PII dump and the role self-escalation.
-- ------------------------------------------------------------

-- 1a. SELECT: own row or admin (was: USING (true) -> world readable). Fixes F2.
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using ( auth.uid() = id or public.is_admin() );

-- 1b. UPDATE policies rewritten via is_admin() (row scoping only).
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );
create policy "profiles_update_admin"
  on public.profiles for update
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- 1c. INSERT policies rewritten via is_admin() (self or admin). Fixes F4 stays closed.
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check ( auth.uid() = id );
create policy "profiles_insert_admin"
  on public.profiles for insert
  with check ( public.is_admin() );

-- 1d. Column-level privileges: no API caller (anon/authenticated) may write `role`.
--     PostgREST PATCH only sends the columns provided, so a normal profile edit
--     (full_name/phone/…) still works; a PATCH that includes `role` errors.
--     The table owner (postgres, used by the SQL editor) keeps full rights by
--     ownership, so the clinic owner can still promote an admin manually.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, email, phone, avatar_url, updated_at)
  on public.profiles to authenticated;
-- anon never edits profiles.

-- 1e. Defense-in-depth trigger: block any role change and any admin-role INSERT
--     coming from an API caller (auth.uid() present) who is not an admin. The
--     SQL editor (auth.uid() null) and admins are unaffected. Fixes F3 + F6.
create or replace function public.enforce_profile_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Server/SQL-editor context (no JWT) and admins may set roles freely.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A self-registered / self-inserted profile is always a client.
    new.role := 'client';
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Not authorized to change profile role';
  end if;
  return new;
end;
$$;
alter function public.enforce_profile_role_guard() owner to postgres;
revoke all on function public.enforce_profile_role_guard() from public;

drop trigger if exists enforce_profile_role_guard_ins on public.profiles;
drop trigger if exists enforce_profile_role_guard_upd on public.profiles;
create trigger enforce_profile_role_guard_ins
  before insert on public.profiles
  for each row execute function public.enforce_profile_role_guard();
create trigger enforce_profile_role_guard_upd
  before update on public.profiles
  for each row execute function public.enforce_profile_role_guard();

-- ------------------------------------------------------------
-- 2. handle_new_user: NEVER trust client-supplied role. Always 'client'.
--    (Google OAuth cannot carry 'role'; email signups can, hence F5.)
--    Keeps the rest of the original behaviour (name/email/phone/avatar,
--    on-conflict name/avatar refresh).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
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
    'client'            -- hard-coded; role is NEVER taken from user metadata
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;
alter function public.handle_new_user() owner to postgres;

-- ------------------------------------------------------------
-- 3. appointments_with_details view: was owner-privileged and granted to
--    anon by Supabase defaults (F1). Make it honour the caller's RLS and
--    drop anon access. (View is unused by the app.)
-- ------------------------------------------------------------
alter view if exists public.appointments_with_details set (security_invoker = true);
do $$
begin
  if to_regclass('public.appointments_with_details') is not null then
    revoke all on public.appointments_with_details from anon;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. APPOINTMENTS: replace the wide-open client UPDATE/INSERT with guarded
--    triggers. RLS still scopes rows to the owner; the triggers scope the
--    *kind* of change a non-admin may make.
-- ------------------------------------------------------------

-- 4a. Rewrite admin references in the RLS policies to is_admin() (perf/consistency).
drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select"
  on public.appointments for select
  using ( auth.uid() = client_id or public.is_admin() );

drop policy if exists "appointments_insert" on public.appointments;
create policy "appointments_insert"
  on public.appointments for insert
  with check ( auth.uid() = client_id or public.is_admin() );

drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update"
  on public.appointments for update
  using ( auth.uid() = client_id or public.is_admin() )
  with check ( auth.uid() = client_id or public.is_admin() );

drop policy if exists "appointments_delete_admin" on public.appointments;
create policy "appointments_delete_admin"
  on public.appointments for delete
  using ( public.is_admin() );

-- 4b. UPDATE guard: a non-admin owner may ONLY cancel a confirmed appointment
--     (confirmed -> cancelled) and/or edit notes. No date/time/client_id
--     changes, no reviving cancelled/completed, no self-"completed". Fixes F7.
create or replace function public.enforce_appointment_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;   -- server/SQL editor and admins unrestricted
  end if;

  if new.client_id is distinct from old.client_id
     or new.date is distinct from old.date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.created_by is distinct from old.created_by then
    raise exception 'Clients cannot modify appointment schedule or ownership';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'confirmed' and new.status = 'cancelled') then
    raise exception 'Clients may only cancel a confirmed appointment';
  end if;

  return new;
end;
$$;
alter function public.enforce_appointment_update_guard() owner to postgres;
revoke all on function public.enforce_appointment_update_guard() from public;
drop trigger if exists enforce_appointment_update_guard on public.appointments;
create trigger enforce_appointment_update_guard
  before update on public.appointments
  for each row execute function public.enforce_appointment_update_guard();

-- 4c. INSERT guard: a non-admin may only book a confirmed appointment for
--     herself, following the same rules as the booking API (lib/availability.ts):
--     from tomorrow on (Argentina time), exactly one hour, on the day's
--     75-minute slot grid inside opening hours, not overlapping a blocked day,
--     slot or time range, and not overlapping a confirmed appointment.
--     Slot rejections use SQLSTATE 23P01 so the API answers 409 ("not
--     available"). The admin (manual bookings, extra slots) is unrestricted.
create or replace function public.enforce_appointment_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_window public.availability%rowtype;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null or public.is_admin() then
    return new;   -- SQL editor and the admin are unrestricted
  end if;

  if new.status is distinct from 'confirmed'
     or new.client_id is distinct from auth.uid() then
    raise exception 'Patients can only book confirmed appointments for themselves';
  end if;
  new.created_by := auth.uid();

  select * into v_window
  from public.availability a
  where a.day_of_week = extract(dow from new.date) and a.is_active;

  if new.date <= v_today
     or v_window.id is null
     or new.end_time is distinct from new.start_time + interval '60 minutes'
     or new.start_time < v_window.start_time
     or new.end_time > v_window.end_time
     or mod((extract(epoch from new.start_time - v_window.start_time) / 60)::int, 75) <> 0
  then
    raise exception using errcode = '23P01', message = 'Requested time is not bookable';
  end if;

  if exists (
    select 1
    from public.availability_overrides o
    where o.date = new.date
      and o.is_blocked
      and (
        -- whole day: no slots and no complete time range
        (coalesce(array_length(o.blocked_slots, 1), 0) = 0
           and (o.start_time is null or o.end_time is null))
        -- a blocked hour that overlaps this one
        or exists (
          select 1 from unnest(o.blocked_slots) as b(slot)
          where b.slot::time < new.end_time
            and new.start_time < b.slot::time + interval '60 minutes'
        )
        -- a blocked time range that overlaps this one
        or (coalesce(array_length(o.blocked_slots, 1), 0) = 0
              and o.start_time is not null and o.end_time is not null
              and o.start_time < new.end_time and new.start_time < o.end_time)
      )
  ) then
    raise exception using errcode = '23P01', message = 'Requested time is blocked';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.date = new.date and a.status = 'confirmed'
      and a.start_time < new.end_time and new.start_time < a.end_time
  ) then
    raise exception using errcode = '23P01', message = 'Requested time is already booked';
  end if;

  return new;
end;
$$;
alter function public.enforce_appointment_insert_guard() owner to postgres;
revoke all on function public.enforce_appointment_insert_guard() from public;
drop trigger if exists enforce_appointment_insert_guard on public.appointments;
create trigger enforce_appointment_insert_guard
  before insert on public.appointments
  for each row execute function public.enforce_appointment_insert_guard();

-- ------------------------------------------------------------
-- 5. Rewrite remaining admin-gated policies to is_admin() (consistency/perf).
--    Behaviour is identical; only the admin sub-check is centralised.
-- ------------------------------------------------------------

-- appointment_treatments
drop policy if exists "apt_treatments_select" on public.appointment_treatments;
create policy "apt_treatments_select"
  on public.appointment_treatments for select
  using ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and (a.client_id = auth.uid() or public.is_admin())
  ) );
drop policy if exists "apt_treatments_insert" on public.appointment_treatments;
create policy "apt_treatments_insert"
  on public.appointment_treatments for insert
  with check ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and (a.client_id = auth.uid() or public.is_admin())
  ) );
drop policy if exists "apt_treatments_delete" on public.appointment_treatments;
create policy "apt_treatments_delete"
  on public.appointment_treatments for delete
  using ( public.is_admin() );

-- treatments
drop policy if exists "treatments_insert_admin" on public.treatments;
create policy "treatments_insert_admin"
  on public.treatments for insert with check ( public.is_admin() );
drop policy if exists "treatments_update_admin" on public.treatments;
create policy "treatments_update_admin"
  on public.treatments for update using ( public.is_admin() );
drop policy if exists "treatments_delete_admin" on public.treatments;
create policy "treatments_delete_admin"
  on public.treatments for delete using ( public.is_admin() );

-- availability
drop policy if exists "availability_insert_admin" on public.availability;
create policy "availability_insert_admin"
  on public.availability for insert with check ( public.is_admin() );
drop policy if exists "availability_update_admin" on public.availability;
create policy "availability_update_admin"
  on public.availability for update using ( public.is_admin() ) with check ( public.is_admin() );

-- availability_overrides
drop policy if exists "overrides_insert_admin" on public.availability_overrides;
create policy "overrides_insert_admin"
  on public.availability_overrides for insert with check ( public.is_admin() );
drop policy if exists "overrides_update_admin" on public.availability_overrides;
create policy "overrides_update_admin"
  on public.availability_overrides for update using ( public.is_admin() ) with check ( public.is_admin() );
drop policy if exists "overrides_delete_admin" on public.availability_overrides;
create policy "overrides_delete_admin"
  on public.availability_overrides for delete using ( public.is_admin() );

-- availability_extra_slots (created in 005)
drop policy if exists "extra_slots_insert_admin" on public.availability_extra_slots;
create policy "extra_slots_insert_admin"
  on public.availability_extra_slots for insert with check ( public.is_admin() );
drop policy if exists "extra_slots_update_admin" on public.availability_extra_slots;
create policy "extra_slots_update_admin"
  on public.availability_extra_slots for update using ( public.is_admin() ) with check ( public.is_admin() );
drop policy if exists "extra_slots_delete_admin" on public.availability_extra_slots;
create policy "extra_slots_delete_admin"
  on public.availability_extra_slots for delete using ( public.is_admin() );

-- ------------------------------------------------------------
-- 6. Least-privilege on functions: internal trigger functions and the Codex
--    availability RPC should not be executable by anon (and the trigger funcs
--    not by authenticated). PostgREST does not expose trigger-returning funcs,
--    so this is defense-in-depth; the Codex RPC revoke is the real fix for its
--    anon exposure. Guarded so this file does not require 006.
-- ------------------------------------------------------------
-- Triggers still fire without EXECUTE; this only hides them from the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_profile_role_guard() from public, anon, authenticated;
revoke execute on function public.enforce_appointment_update_guard() from public, anon, authenticated;
revoke execute on function public.enforce_appointment_insert_guard() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_confirmed_appointment_windows'
  ) then
    execute 'revoke execute on function public.get_confirmed_appointment_windows(date[]) from anon';
    execute 'grant execute on function public.get_confirmed_appointment_windows(date[]) to authenticated';
  end if;
end $$;

commit;

-- Status: the first four columns should be true. "admins" should list only
-- the people who are supposed to be admins; anyone else there may have used
-- one of the holes above.
select
  (to_regclass('public.appointments_with_details') is null
    or not has_table_privilege('anon', 'public.appointments_with_details', 'select'))
    as details_view_private,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and qual = 'true'
  ) as profiles_private,
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    as roles_locked,
  exists (
    select 1 from pg_trigger
    where tgname = 'enforce_appointment_insert_guard' and not tgisinternal
  ) as booking_guard_on,
  (select string_agg(coalesce(nullif(full_name, ''), email), ', ')
   from public.profiles where role = 'admin') as admins;
