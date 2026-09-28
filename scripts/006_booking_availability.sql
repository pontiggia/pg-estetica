-- ============================================================
-- Migration: booking availability
--
-- Run this whole file once in the Supabase SQL Editor BEFORE deploying the
-- code that uses it. It is safe to run again.
--
-- 1. get_booked_windows(dates): returns the date, start and end time of
--    every confirmed appointment on the given dates, and nothing else (no
--    names, no treatments). Patients can only read their own appointments
--    (RLS), so without this the booking screen showed slots already taken by
--    other patients as free.
-- 2. A unique index so two confirmed appointments can never start on the
--    same date and time, even if two people confirm at the same moment.
--
-- The last statement prints a status row: every column should be true / 0.
-- ============================================================

-- Earlier draft of this function (different name), if it was ever created
drop function if exists public.get_confirmed_appointment_windows(date[]);

create or replace function public.get_booked_windows(p_dates date[])
returns table (appointment_date date, start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select a.date, a.start_time, a.end_time
  from public.appointments a
  where a.status = 'confirmed'
    and a.date = any (p_dates);
$$;

-- Only logged-in users. Supabase grants new functions to anon explicitly, so
-- revoking from public alone is not enough.
revoke all on function public.get_booked_windows(date[]) from public, anon;
grant execute on function public.get_booked_windows(date[]) to authenticated;


-- 2. One confirmed appointment per date + start time.
-- If double bookings already exist the index cannot be created: instead of
-- failing the whole script, this skips it and the status row below reports
-- how many to fix (cancel the extra ones, then run this file again).
do $$
begin
  if exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.appointments'::regclass
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) ilike '%(date, start_time)%'
      and pg_get_expr(i.indpred, i.indrelid) ilike '%status%confirmed%'
  ) then
    return; -- already there (possibly created by hand under another name)
  end if;

  if exists (
    select 1
    from public.appointments
    where status = 'confirmed'
    group by date, start_time
    having count(*) > 1
  ) then
    raise warning 'Double bookings found: unique index not created';
    return;
  end if;

  create unique index appointments_one_confirmed_per_slot
    on public.appointments (date, start_time)
    where status = 'confirmed';
end $$;


-- Status
select
  exists (
    select 1 from pg_proc
    where proname = 'get_booked_windows'
      and pronamespace = 'public'::regnamespace
  ) as booking_function_ok,
  not has_function_privilege('anon', 'public.get_booked_windows(date[])', 'execute')
    as hidden_from_anonymous,
  exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.appointments'::regclass
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) ilike '%(date, start_time)%'
      and pg_get_expr(i.indpred, i.indrelid) ilike '%status%confirmed%'
  ) as double_booking_protection_ok,
  (
    select count(*)
    from (
      select 1
      from public.appointments
      where status = 'confirmed'
      group by date, start_time
      having count(*) > 1
    ) d
  ) as double_bookings_to_fix;
