-- ============================================================
-- Read-only diagnostic (changes nothing).
-- Paste in the Supabase SQL Editor, run, and look at / share the result.
--
-- A. Indexes on appointments (is double-booking protection there?)
-- B. Weekly schedule and extra slots
-- C. Double bookings: two confirmed appointments at the same date and time
-- D. Confirmed appointments that overlap each other (different start times)
-- E. Appointments booked AFTER that day or slot had been blocked
-- F. Upcoming slot blocks that are not on the patients' slot grid (these
--    had no effect before the fix)
-- G. Users with the admin role
-- ============================================================
with grid as (
  -- The slots patients see for each open weekday: every 75 minutes from the
  -- opening time while the whole hour fits
  select av.day_of_week, s::time as slot
  from public.availability av,
       generate_series(
         '2000-01-01'::date + av.start_time,
         '2000-01-01'::date + av.end_time - interval '60 minutes',
         interval '75 minutes'
       ) s
  where av.is_active
),
blocks as (
  -- One row per blocked hour (specific slots) or per blocked day
  select o.id, o.date, o.created_at, b.slot::time as slot
  from public.availability_overrides o
  cross join lateral unnest(o.blocked_slots) as b(slot)
  where o.is_blocked and coalesce(array_length(o.blocked_slots, 1), 0) > 0
  union all
  select o.id, o.date, o.created_at, null
  from public.availability_overrides o
  where o.is_blocked
    and coalesce(array_length(o.blocked_slots, 1), 0) = 0
    and (o.start_time is null or o.end_time is null)
)
select section, detail
from (
  select 1 as ord, 0 as sub, 'A. index' as section, indexname || ': ' || indexdef as detail
  from pg_indexes
  where schemaname = 'public' and tablename = 'appointments'

  union all
  select 2, (day_of_week + 6) % 7, 'B. weekly schedule',
    (array['Dom','Lun','Mar','Mie','Jue','Vie','Sab'])[day_of_week + 1] || ' ' ||
    to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI') ||
    case when is_active then '' else ' (cerrado)' end
  from public.availability

  union all
  select 3, (day_of_week + 6) % 7, 'B. extra slot',
    (array['Dom','Lun','Mar','Mie','Jue','Vie','Sab'])[day_of_week + 1] || ' ' ||
    to_char(time_slot, 'HH24:MI') || case when is_active then '' else ' (inactivo)' end
  from public.availability_extra_slots

  union all
  select 4, 0, 'C. double booking',
    date || ' ' || to_char(start_time, 'HH24:MI') || ' -> ' || count(*) || ' confirmed'
  from public.appointments
  where status = 'confirmed'
  group by date, start_time
  having count(*) > 1

  union all
  select 5, 0, 'D. overlapping bookings',
    a.date || ' ' || to_char(a.start_time, 'HH24:MI') || ' and ' || to_char(b.start_time, 'HH24:MI')
  from public.appointments a
  join public.appointments b
    on b.date = a.date and b.id > a.id
   and a.start_time < b.end_time and b.start_time < a.end_time
   and a.start_time <> b.start_time
  where a.status = 'confirmed' and b.status = 'confirmed'

  union all
  select 6, 0, 'E. booked after being blocked',
    a.date || ' ' || to_char(a.start_time, 'HH24:MI') || ' (' || a.status || ') booked ' ||
    to_char(a.created_at, 'YYYY-MM-DD HH24:MI') || ', blocked ' ||
    coalesce('slot ' || to_char(bl.slot, 'HH24:MI'), 'whole day') || ' since ' ||
    to_char(bl.created_at, 'YYYY-MM-DD HH24:MI')
  from public.appointments a
  join blocks bl
    on bl.date = a.date
   and (bl.slot is null or (a.start_time < bl.slot + interval '60 minutes' and bl.slot < a.end_time))
  where a.created_at > bl.created_at
    and a.created_by = a.client_id -- booked by the patient, not by the admin

  union all
  select 7, 0, 'F. block off the patients grid',
    bl.date || ' ' || to_char(bl.slot, 'HH24:MI') || ' (' ||
    (array['Dom','Lun','Mar','Mie','Jue','Vie','Sab'])[extract(dow from bl.date)::int + 1] || ')'
  from blocks bl
  where bl.slot is not null
    and bl.date >= current_date
    and not exists (
      select 1 from grid g
      where g.day_of_week = extract(dow from bl.date) and g.slot = bl.slot
    )

  union all
  select 8, 0, 'G. admin', coalesce(full_name, '') || ' <' || coalesce(email, '') || '> since ' ||
    to_char(created_at, 'YYYY-MM-DD')
  from public.profiles
  where role = 'admin'
) diagnostic
order by ord, sub, detail;
