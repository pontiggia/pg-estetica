import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// PATCH /api/availability/:id - Update a day's schedule (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.start_time !== undefined) updates.start_time = body.start_time
  if (body.end_time !== undefined) updates.end_time = body.end_time

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("availability")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
