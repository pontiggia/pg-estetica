import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/slots/check?date=yyyy-mm-dd - Quick check if a date has any availability
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const date = request.nextUrl.searchParams.get("date")

  if (!date) {
    return NextResponse.json({ error: "date query param required" }, { status: 400 })
  }

  const dayDate = new Date(date + "T12:00:00")
  const dayOfWeek = dayDate.getDay()

  // Check weekly schedule
  const { data: availData } = await supabase
    .from("availability")
    .select("id")
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true)
    .single()

  if (!availData) {
    return NextResponse.json({ available: false })
  }

  // Check full day block
  const { data: overrides } = await supabase
    .from("availability_overrides")
    .select("id, blocked_slots")
    .eq("date", date)
    .eq("is_blocked", true)

  const fullDayBlock = overrides?.find(
    (o) => !o.blocked_slots || o.blocked_slots.length === 0
  )

  return NextResponse.json({ available: !fullDayBlock })
}
