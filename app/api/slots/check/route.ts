import { createClient } from "@/lib/supabase/server"
import { getAvailableSlots, isValidDate } from "@/lib/availability"
import { loadDaySchedules } from "@/lib/availability-server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/slots/check?date=yyyy-mm-dd - Quick check if a date has a free slot
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const date = request.nextUrl.searchParams.get("date")

  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date query param required (yyyy-mm-dd)" }, { status: 400 })
  }

  try {
    const schedules = await loadDaySchedules(supabase, [date])
    return NextResponse.json({ available: getAvailableSlots(schedules[date]).length > 0 })
  } catch (error) {
    console.error("[Slots]", error)
    return NextResponse.json({ error: "No se pudo verificar la disponibilidad" }, { status: 500 })
  }
}
