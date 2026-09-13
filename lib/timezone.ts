/**
 * Appointment dates/times are stored as local Argentina wall-clock values
 * ("yyyy-MM-dd" + "HH:mm[:ss]"). These helpers convert them to real instants
 * so time-window calculations (e.g. "24 hours before") are correct no matter
 * which timezone the server runs in.
 */
export const ARGENTINA_TIMEZONE = "America/Argentina/Buenos_Aires"

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ARGENTINA_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

/** Wall-clock components of `instant` as seen in Argentina. */
function zonedParts(instant: Date) {
  const parts: Record<string, number> = {}
  for (const { type, value } of partsFormatter.formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value)
  }
  return parts
}

/** Offset (ms) between the Argentina wall clock and UTC at `instant`. */
function offsetMs(instant: Date): number {
  const p = zonedParts(instant)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - instant.getTime()
}

/**
 * Converts an Argentina local date ("yyyy-MM-dd") and time ("HH:mm[:ss]")
 * into the corresponding UTC instant.
 */
export function argentinaDateTimeToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm, ss = 0] = time.split(":").map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss)
  // Two passes handle the (theoretical) case of a DST transition.
  const first = naive - offsetMs(new Date(naive))
  const second = naive - offsetMs(new Date(first))
  return new Date(second)
}

/** "yyyy-MM-dd" for `instant` as seen in Argentina. */
export function argentinaDateString(instant: Date): string {
  const p = zonedParts(instant)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}
