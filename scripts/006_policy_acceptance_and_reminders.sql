-- ============================================================
-- Migration: cancellation policy acceptance + WhatsApp reminders
--
--   - policy_accepted_at: when the patient accepted the appointment and
--     cancellation policy (null for appointments created by the admin).
--   - reminder_sent_at: when the ~24h WhatsApp reminder was sent. Used as a
--     claim so the hourly cron never sends the same reminder twice.
--   - Partial index for the cron query: confirmed appointments that still
--     have no reminder, ordered by date and start time.
-- ============================================================

alter table public.appointments
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_appointments_reminder_pending
  on public.appointments (date, start_time)
  where status = 'confirmed' and reminder_sent_at is null;
