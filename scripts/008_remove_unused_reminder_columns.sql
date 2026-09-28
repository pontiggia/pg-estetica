-- ============================================================
-- Optional cleanup: remove what the abandoned "policy acceptance + WhatsApp
-- reminders" feature added to the database. That feature was never deployed
-- and the app does not use these.
--
-- Removes ONLY:
--   - column appointments.policy_accepted_at
--   - column appointments.reminder_sent_at
--   - index  idx_appointments_reminder_pending
-- No appointment (row) is deleted and every other column stays as it is.
-- Runs as one transaction and is safe to run again.
-- ============================================================

begin;

drop index if exists public.idx_appointments_reminder_pending;

alter table public.appointments
  drop column if exists policy_accepted_at,
  drop column if exists reminder_sent_at;

commit;

-- Same number as before running this file
select count(*) as appointments_kept from public.appointments;
