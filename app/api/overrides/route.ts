import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/overrides - List all overrides
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("availability_overrides")
    .select("*")
    .order("date", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/overrides - Create an override (admin only)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { date, start_time, end_time, is_blocked, reason, blocked_slots } = body

  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("availability_overrides")
    .insert({
      date,
      start_time: start_time || null,
      end_time: end_time || null,
      is_blocked: is_blocked !== false,
      reason: reason || null,
      blocked_slots: blocked_slots || [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
