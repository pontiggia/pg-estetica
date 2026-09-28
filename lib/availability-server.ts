import type { createClient } from "@/lib/supabase/server"
import { dayOfWeek, type DaySchedule } from "@/lib/availability"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export const MAX_DATES_PER_REQUEST = 62

// Booked times are only available to logged-in users
export class NotSignedInError extends Error {}

// Loads everything needed to compute the slots of the given dates.
//
// Patients can only read their own appointments (RLS), so booked times are
// read through the get_booked_windows() database function
// (scripts/006_booking_availability.sql), which returns the dates and times of
// every confirmed appointment and nothing else.
//
// Throws if any query fails: showing a slot as free because a query failed
// is exactly the bug this module exists to prevent.
export async function loadDaySchedules(
  supabase: SupabaseServerClient,
  dates: string[],
): Promise<Record<string, DaySchedule>> {
  const [availability, overrides, extraSlots, booked] = await Promise.all([
    supabase
      .from("availability")
      .select("day_of_week, start_time, end_time")
      .eq("is_active", true),
    supabase
      .from("availability_overrides")
      .select("date, is_blocked, start_time, end_time, blocked_slots")
      .in("date", dates),
    supabase
      .from("availability_extra_slots")
      .select("day_of_week, time_slot")
      .eq("is_active", true),
    supabase.rpc("get_booked_windows", { p_dates: dates }),
  ])

  for (const result of [availability, overrides, extraSlots, booked]) {
    if (result.error?.code === "42501") throw new NotSignedInError(result.error.message)
    if (result.error) {
      throw new Error(`Could not load availability: ${result.error.message}`)
    }
  }

  const schedules: Record<string, DaySchedule> = {}
  for (const date of dates) {
    const weekday = dayOfWeek(date)
    const window = (availability.data ?? []).find((a) => a.day_of_week === weekday)
    schedules[date] = {
      window: window ? { start_time: window.start_time, end_time: window.end_time } : null,
      overrides: (overrides.data ?? []).filter((o) => o.date === date),
      booked: ((booked.data ?? []) as BookedWindowRow[])
        .filter((b) => b.appointment_date === date)
        .map((b) => ({ start_time: b.start_time, end_time: b.end_time })),
      extraSlots: (extraSlots.data ?? [])
        .filter((e) => e.day_of_week === weekday)
        .map((e) => e.time_slot),
    }
  }
  return schedules
}

interface BookedWindowRow {
  appointment_date: string
  start_time: string
  end_time: string
}
