-- ============================================================
-- Seed Data for Paula Guerendiain - Estetica Integral
-- Run AFTER 001_create_tables.sql
-- NOTE: Client profiles are created via auth.users trigger.
--       This seeds treatments, availability, and sample overrides.
-- ============================================================

-- Treatments
insert into public.treatments (name, is_active) values
  ('Limpieza facial profunda', true),
  ('Hidratacion facial', true),
  ('Radiofrecuencia corporal', true),
  ('Drenaje linfatico', true),
  ('Masaje descontracturante', true),
  ('Peeling quimico', false)
on conflict do nothing;

-- Weekly availability (0=Sunday .. 6=Saturday)
insert into public.availability (day_of_week, start_time, end_time, is_active) values
  (0, '00:00', '00:00', false),  -- Domingo off
  (1, '09:00', '17:00', true),   -- Lunes
  (2, '09:00', '17:00', true),   -- Martes
  (3, '09:00', '17:00', true),   -- Miercoles
  (4, '09:00', '17:00', true),   -- Jueves
  (5, '09:00', '14:00', true),   -- Viernes
  (6, '00:00', '00:00', false)   -- Sabado off
on conflict (day_of_week) do nothing;

-- Sample overrides (holidays)
insert into public.availability_overrides (date, is_blocked, reason, blocked_slots) values
  ('2026-02-24', true, 'Feriado - Carnaval', '{}'),
  ('2026-02-25', true, 'Feriado - Carnaval', '{}');
