// Booking slot rules shared by the API routes (the authoritative checks) and
// the admin screens, so every part of the app agrees on what a slot is.
// Pure functions only: safe to import from both server and client code.

// Each appointment lasts 60 minutes; slots start every 75 minutes
// (60 minutes of treatment + 15 minutes of buffer).
export const APPOINTMENT_MINUTES = 60
export const SLOT_STEP_MINUTES = 75

export interface DayWindow {
  start_time: string
  end_time: string
}

export interface OverrideRule {
  is_blocked: boolean
  start_time: string | null
  end_time: string | null
  blocked_slots: string[] | null
}

export interface BookedWindow {
  start_time: string
  end_time: string
}

export interface DaySchedule {
  // null when the weekday is closed
  window: DayWindow | null
  overrides: OverrideRule[]
  booked: BookedWindow[]
  // Admin-only slots outside the regular window (availability_extra_slots)
  extraSlots: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

export function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE_RE.test(date) || date < "2000") return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
}

export function isValidTime(time: unknown): time is string {
  return typeof time === "string" && TIME_RE.test(time)
}

// Weekday (0 = Sunday) of a yyyy-mm-dd date, independent of the server timezone
export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

// Today's date (yyyy-mm-dd) in Argentina; the server runs in UTC on Vercel.
export function todayInArgentina(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

// "09:00:00" (as Postgres returns it) -> "09:00"
export function normalizeTime(time: string): string {
  return minutesToTime(timeToMinutes(time))
}

export function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes)
}

// Regular slots of a day: every 75 minutes from the opening time, as long as
// the whole 60-minute appointment fits before closing time.
export function generateDaySlots(window: DayWindow): string[] {
  const start = timeToMinutes(window.start_time)
  const end = timeToMinutes(window.end_time)
  const slots: string[] = []
  for (let t = start; t + APPOINTMENT_MINUTES <= end; t += SLOT_STEP_MINUTES) {
    slots.push(minutesToTime(t))
  }
  return slots
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd
}

// An override without specific slots and without a time range blocks the day.
export function isFullDayBlock(override: OverrideRule): boolean {
  return (
    override.is_blocked &&
    (!override.blocked_slots || override.blocked_slots.length === 0) &&
    !(override.start_time && override.end_time)
  )
}

// A blocked slot "HH:MM" means the hour starting at HH:MM is unavailable, so
// it blocks every slot that overlaps that hour. For slots on the same grid
// this is the same as an exact match, and it keeps working when a block was
// created on a different grid (e.g. before the opening time was changed).
function overrideBlocksSlot(override: OverrideRule, slot: string): boolean {
  if (!override.is_blocked) return false

  const start = timeToMinutes(slot)
  const end = start + APPOINTMENT_MINUTES

  if (override.blocked_slots && override.blocked_slots.length > 0) {
    return override.blocked_slots.some((blocked) => {
      const blockedStart = timeToMinutes(blocked)
      return overlaps(start, end, blockedStart, blockedStart + APPOINTMENT_MINUTES)
    })
  }

  if (override.start_time && override.end_time) {
    return overlaps(
      start,
      end,
      timeToMinutes(override.start_time),
      timeToMinutes(override.end_time),
    )
  }

  return true
}

export function isSlotBlocked(slot: string, overrides: OverrideRule[]): boolean {
  return overrides.some((override) => overrideBlocksSlot(override, slot))
}

export function isSlotBooked(slot: string, booked: BookedWindow[]): boolean {
  const start = timeToMinutes(slot)
  const end = start + APPOINTMENT_MINUTES
  return booked.some((appointment) => {
    const bookedStart = timeToMinutes(appointment.start_time)
    const bookedEnd = timeToMinutes(appointment.end_time)
    return overlaps(
      start,
      end,
      bookedStart,
      bookedEnd > bookedStart ? bookedEnd : bookedStart + APPOINTMENT_MINUTES,
    )
  })
}

// All slots of the day, before removing blocked or booked ones.
export function candidateSlots(day: DaySchedule, includeExtra: boolean): string[] {
  if (!day.window) return []
  const slots = new Set(generateDaySlots(day.window))
  if (includeExtra) {
    for (const extra of day.extraSlots) slots.add(normalizeTime(extra))
  }
  return [...slots].sort()
}

export function getAvailableSlots(day: DaySchedule, includeExtra = false): string[] {
  if (day.overrides.some(isFullDayBlock)) return []
  return candidateSlots(day, includeExtra).filter(
    (slot) => !isSlotBlocked(slot, day.overrides) && !isSlotBooked(slot, day.booked),
  )
}

export type SlotStatus = "available" | "closed" | "blocked" | "booked"

// Why a given slot can or cannot be booked (used to validate new bookings).
export function getSlotStatus(
  day: DaySchedule,
  slot: string,
  includeExtra = false,
): SlotStatus {
  if (!candidateSlots(day, includeExtra).includes(normalizeTime(slot))) return "closed"
  if (isSlotBlocked(slot, day.overrides)) return "blocked"
  if (isSlotBooked(slot, day.booked)) return "booked"
  return "available"
}
