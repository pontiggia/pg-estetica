import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/appointments/:id - Get single appointment with details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      *,
      client:profiles!appointments_client_id_fkey(id, full_name, email, phone),
      treatments:appointment_treatments(
        treatment:treatments(id, name)
      )
    `)
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const formatted = {
    ...data,
    treatments: data.treatments?.map((at: { treatment: { id: string; name: string } }) => at.treatment) ?? [],
  }

  return NextResponse.json(formatted)
}

// PATCH /api/appointments/:id - Update appointment (status, notes)
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

  if (body.status !== undefined) {
    if (!["confirmed", "cancelled", "completed"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    updates.status = body.status
  }
  if (body.notes !== undefined) updates.notes = body.notes

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
