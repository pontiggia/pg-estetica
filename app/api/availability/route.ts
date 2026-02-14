import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/availability - Get weekly schedule
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("availability")
    .select("*")
    .order("day_of_week", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
