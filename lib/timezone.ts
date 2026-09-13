/**
 * Appointment dates/times are stored as local Argentina wall-clock values
 * ("yyyy-MM-dd" + "HH:mm[:ss]"). These helpers resolve "today"/"tomorrow" in
 * Argentina no matter which timezone the server runs in.
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

/** "yyyy-MM-dd" for `instant` as seen in Argentina. */
export function argentinaDateString(instant: Date): string {
  const p = zonedParts(instant)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}
