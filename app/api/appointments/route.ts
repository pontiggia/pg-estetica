import { createClient } from "@/lib/supabase/server"
import { notifyNewAppointment } from "@/lib/whatsapp"
import { NextRequest, NextResponse } from "next/server"

// GET /api/appointments - List appointments (filtered by query params)
// ?client_id=xxx  - filter by client
// ?date=yyyy-mm-dd - filter by date
// ?status=confirmed - filter by status
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl

  let query = supabase
    .from("appointments")
    .select(`
      *,
      client:profiles!appointments_client_id_fkey(id, full_name, email, phone),
      treatments:appointment_treatments(
        treatment:treatments(id, name)
      )
    `)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })

  const clientId = searchParams.get("client_id")
  if (clientId) query = query.eq("client_id", clientId)

  const date = searchParams.get("date")
  if (date) query = query.eq("date", date)

  const status = searchParams.get("status")
  if (status) query = query.eq("status", status)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the nested treatments structure
  const formatted = data?.map((apt) => ({
    ...apt,
    treatments: apt.treatments?.map((at: { treatment: { id: string; name: string } }) => at.treatment) ?? [],
  }))

  return NextResponse.json(formatted)
}

// POST /api/appointments - Create a new appointment
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { client_id, date, start_time, end_time, treatment_ids, notes } = body

  if (!client_id || !date || !start_time || !end_time || !treatment_ids?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Check for time conflicts (same date + overlapping time + confirmed)
  const { data: conflicts } = await supabase
    .from("appointments")
    .select("id")
    .eq("date", date)
    .eq("start_time", start_time)
    .eq("status", "confirmed")

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Time slot already taken" }, { status: 409 })
  }

  // Create the appointment
  const { data: appointment, error: aptError } = await supabase
    .from("appointments")
    .insert({
      client_id,
      date,
      start_time,
      end_time,
      notes: notes || null,
      created_by: user.id,
      status: "confirmed",
    })
    .select()
    .single()

  if (aptError) {
    // Unique constraint violation — another booking won the race
    if (aptError.code === "23505") {
      return NextResponse.json({ error: "Time slot already taken" }, { status: 409 })
    }
    return NextResponse.json({ error: aptError.message }, { status: 500 })
  }

  // Link treatments
  const treatmentLinks = treatment_ids.map((tid: string) => ({
    appointment_id: appointment.id,
    treatment_id: tid,
  }))

  const { error: linkError } = await supabase
    .from("appointment_treatments")
    .insert(treatmentLinks)

  if (linkError) {
    // Rollback the appointment if treatment linking fails
    await supabase.from("appointments").delete().eq("id", appointment.id)
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  // WhatsApp notification (fire-and-forget)
  const { data: details } = await supabase
    .from("appointments")
    .select(`
      date, start_time,
      client:profiles!appointments_client_id_fkey(full_name, phone),
      treatments:appointment_treatments(treatment:treatments(name))
    `)
    .eq("id", appointment.id)
    .single()

  if (details?.client) {
    const client = details.client as unknown as { full_name: string; phone: string | null }
    const treatments = (details.treatments as unknown as Array<{ treatment: { name: string } }>)
      ?.map((at) => at.treatment.name)
      .join(", ") || "—"
    const phone = (client.phone || "").replace(/[^0-9]/g, "")
    notifyNewAppointment({
      clientName: client.full_name,
      date: details.date,
      time: details.start_time,
      treatments,
      clientPhone: phone,
    })
  }

  return NextResponse.json(appointment, { status: 201 })
}
