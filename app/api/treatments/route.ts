import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/treatments - List all treatments
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("treatments")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/treatments - Create a new treatment (admin only)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("treatments")
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
