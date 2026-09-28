// Run with: pnpm test  (Node >= 22.18, which runs TypeScript natively)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  addMinutes,
  dayOfWeek,
  generateDaySlots,
  getAvailableSlots,
  getSlotStatus,
  isFullDayBlock,
  isSlotBlocked,
  isSlotBooked,
  isValidDate,
  isValidTime,
  normalizeTime,
  todayInArgentina,
  type DaySchedule,
  type OverrideRule,
} from "./availability.ts"

const MON_THU = { start_time: "09:00:00", end_time: "17:00:00" }
const FRIDAY = { start_time: "09:00:00", end_time: "14:00:00" }

const slotsBlock = (...slots: string[]): OverrideRule => ({
  is_blocked: true,
  start_time: null,
  end_time: null,
  blocked_slots: slots,
})
const fullDayBlock: OverrideRule = slotsBlock()
const rangeBlock = (start: string, end: string): OverrideRule => ({
  is_blocked: true,
  start_time: start,
  end_time: end,
  blocked_slots: [],
})
const booking = (start: string, end: string) => ({ start_time: start, end_time: end })

const day = (overrides: Partial<DaySchedule> = {}): DaySchedule => ({
  window: MON_THU,
  overrides: [],
  booked: [],
  extraSlots: [],
  ...overrides,
})

test("slots every 75 minutes while the whole hour fits", () => {
  assert.deepEqual(generateDaySlots(MON_THU), ["09:00", "10:15", "11:30", "12:45", "14:00", "15:15"])
  assert.deepEqual(generateDaySlots(FRIDAY), ["09:00", "10:15", "11:30", "12:45"])
  assert.deepEqual(generateDaySlots({ start_time: "08:30", end_time: "20:00" }), [
    "08:30", "09:45", "11:00", "12:15", "13:30", "14:45", "16:00", "17:15", "18:30",
  ])
  assert.deepEqual(generateDaySlots({ start_time: "09:00", end_time: "10:00" }), ["09:00"])
  assert.deepEqual(generateDaySlots({ start_time: "09:00", end_time: "09:59" }), [])
  assert.deepEqual(generateDaySlots({ start_time: "17:00", end_time: "09:00" }), [])
})

test("full-day block: no specific slots and no time range", () => {
  assert.equal(isFullDayBlock(fullDayBlock), true)
  assert.equal(isFullDayBlock({ ...fullDayBlock, blocked_slots: null }), true)
  assert.equal(isFullDayBlock(slotsBlock("10:15")), false)
  assert.equal(isFullDayBlock(rangeBlock("12:00", "13:00")), false)
  assert.equal(isFullDayBlock({ ...fullDayBlock, is_blocked: false }), false)
})

test("blocked slots match exactly on the same grid", () => {
  const overrides = [slotsBlock("10:15")]
  assert.equal(isSlotBlocked("10:15", overrides), true)
  assert.equal(isSlotBlocked("09:00", overrides), false)
  assert.equal(isSlotBlocked("11:30", overrides), false)
  assert.equal(isSlotBlocked("10:15", [slotsBlock("10:15:00")]), true)
})

test("a block made on another grid blocks every slot it overlaps", () => {
  // e.g. 09:45 blocked from a grid that started at 08:30, day starts at 09:00
  const overrides = [slotsBlock("09:45")]
  assert.equal(isSlotBlocked("09:00", overrides), true)
  assert.equal(isSlotBlocked("10:15", overrides), true)
  assert.equal(isSlotBlocked("11:30", overrides), false)
})

test("time-range blocks cover overlapping slots only", () => {
  const overrides = [rangeBlock("12:00", "13:00")]
  assert.equal(isSlotBlocked("11:30", overrides), true)
  assert.equal(isSlotBlocked("12:45", overrides), true)
  assert.equal(isSlotBlocked("10:15", overrides), false)
  assert.equal(isSlotBlocked("14:00", overrides), false)
})

test("overrides that are not blocking are ignored", () => {
  assert.equal(isSlotBlocked("10:15", [{ ...slotsBlock("10:15"), is_blocked: false }]), false)
  assert.equal(isSlotBlocked("10:15", [{ ...fullDayBlock, is_blocked: false }]), false)
})

test("booked slots: any overlap counts, touching does not", () => {
  assert.equal(isSlotBooked("10:15", [booking("10:15:00", "11:15:00")]), true)
  assert.equal(isSlotBooked("10:15", [booking("09:45", "10:45")]), true)
  assert.equal(isSlotBooked("11:00", [booking("10:00", "11:00")]), false)
  assert.equal(isSlotBooked("18:30", [booking("19:30", "20:30")]), false)
  // A malformed end time still occupies the hour
  assert.equal(isSlotBooked("10:15", [booking("10:15", "10:15")]), true)
})

test("available slots exclude blocked and booked ones", () => {
  const slots = getAvailableSlots(
    day({ overrides: [slotsBlock("10:15")], booked: [booking("12:45", "13:45")] }),
  )
  assert.deepEqual(slots, ["09:00", "11:30", "14:00", "15:15"])
})

test("closed weekday or full-day block: no slots at all", () => {
  assert.deepEqual(getAvailableSlots(day({ window: null })), [])
  assert.deepEqual(getAvailableSlots(day({ overrides: [fullDayBlock] })), [])
})

test("a day with every slot booked has no availability", () => {
  const booked = generateDaySlots(FRIDAY).map((s) => booking(s, addMinutes(s, 60)))
  assert.deepEqual(getAvailableSlots(day({ window: FRIDAY, booked })), [])
})

test("extra slots are only offered when asked (admin)", () => {
  const friday = day({ window: FRIDAY, extraSlots: ["19:30:00"] })
  assert.deepEqual(getAvailableSlots(friday), ["09:00", "10:15", "11:30", "12:45"])
  assert.deepEqual(getAvailableSlots(friday, true), ["09:00", "10:15", "11:30", "12:45", "19:30"])
  assert.deepEqual(
    getAvailableSlots({ ...friday, booked: [booking("19:30", "20:30")] }, true),
    ["09:00", "10:15", "11:30", "12:45"],
  )
})

test("slot status explains why a booking is rejected", () => {
  const schedule = day({
    window: FRIDAY,
    overrides: [slotsBlock("10:15")],
    booked: [booking("11:30", "12:30")],
    extraSlots: ["19:30"],
  })
  assert.equal(getSlotStatus(schedule, "09:00"), "available")
  assert.equal(getSlotStatus(schedule, "09:00:00"), "available")
  assert.equal(getSlotStatus(schedule, "10:15"), "blocked")
  assert.equal(getSlotStatus(schedule, "11:30"), "booked")
  assert.equal(getSlotStatus(schedule, "09:30"), "closed")
  assert.equal(getSlotStatus(schedule, "19:30"), "closed")
  assert.equal(getSlotStatus(schedule, "19:30", true), "available")
  assert.equal(getSlotStatus({ ...schedule, overrides: [fullDayBlock] }, "09:00"), "blocked")
  assert.equal(getSlotStatus({ ...schedule, window: null }, "09:00"), "closed")
})

test("input validation", () => {
  assert.equal(isValidDate("2026-10-05"), true)
  assert.equal(isValidDate("2026-02-31"), false)
  assert.equal(isValidDate("2026-2-5"), false)
  assert.equal(isValidDate(null), false)
  assert.equal(isValidTime("09:00"), true)
  assert.equal(isValidTime("09:00:00"), true)
  assert.equal(isValidTime("9:00"), false)
  assert.equal(isValidTime("24:00"), false)
  assert.equal(isValidTime("09:60"), false)
  assert.equal(normalizeTime("09:05:00"), "09:05")
})

test("weekday does not depend on the server timezone", () => {
  const original = process.env.TZ
  try {
    for (const tz of ["UTC", "America/Argentina/Buenos_Aires", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      process.env.TZ = tz
      assert.equal(dayOfWeek("2026-10-05"), 1, tz) // Monday
      assert.equal(dayOfWeek("2026-10-09"), 5, tz) // Friday
    }
  } finally {
    process.env.TZ = original
  }
})

test("today is computed in Argentina time", () => {
  assert.equal(todayInArgentina(new Date("2026-09-29T02:30:00Z")), "2026-09-28")
  assert.equal(todayInArgentina(new Date("2026-09-29T03:30:00Z")), "2026-09-29")
})
