import { createClient } from "@/lib/supabase/server"
import {
  addMinutes,
  APPOINTMENT_MINUTES,
  getSlotStatus,
  isValidDate,
  isValidTime,
  normalizeTime,
  todayInArgentina,
  type SlotStatus,
} from "@/lib/availability"
import { loadDaySchedules } from "@/lib/availability-server"
import { notifyNewAppointment } from "@/lib/whatsapp"
import { NextRequest, NextResponse } from "next/server"

const UNAVAILABLE_SLOT_ERRORS: Record<Exclude<SlotStatus, "available">, string> = {
  closed: "Este horario no está disponible para reservas",
  blocked: "Este horario está bloqueado",
  booked: "Este horario ya está reservado",
}

// Supabase returns at most "max rows" (1000 by default) rows per request, so
// larger lists are read page by page.
const MAX_PAGES = 50

// GET /api/appointments - List appointments (filtered by query params)
// ?client_id=xxx  - filter by client
// ?date=yyyy-mm-dd - filter by date
// ?status=confirmed - filter by status
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl
  const clientId = searchParams.get("client_id")
  const date = searchParams.get("date")
  const status = searchParams.get("status")

  const page = (offset: number) => {
    let query = supabase
      .from("appointments")
      .select(
        `
      *,
      client:profiles!appointments_client_id_fkey(id, full_name, email, phone),
      treatments:appointment_treatments(
        treatment:treatments(id, name)
      )
    `,
        { count: "exact" },
      )
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      // Unique tiebreaker so pages never overlap or skip rows
      .order("id", { ascending: true })
      .range(offset, offset + 999)

    if (clientId) query = query.eq("client_id", clientId)
    if (date) query = query.eq("date", date)
    if (status) query = query.eq("status", status)
    return query
  }

  // Without this, once there are more appointments than one page holds, the
  // newest ones (the upcoming appointments) silently disappear from the lists.
  const data = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data: rows, count, error } = await page(data.length)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    data.push(...rows)
    if (rows.length === 0 || data.length >= (count ?? 0)) break
  }

  // Flatten the nested treatments structure
  const formatted = data.map((apt) => ({
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
  const { client_id, date, start_time, treatment_ids, notes } = body

  if (!client_id || !date || !start_time || !Array.isArray(treatment_ids) || !treatment_ids.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  if (!isValidDate(date) || !isValidTime(start_time)) {
    return NextResponse.json({ error: "Fecha u horario inválido" }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  const isAdmin = profile?.role === "admin"

  // Patients book for themselves and from tomorrow on; the admin can book for
  // any client, on any day, including the admin-only extra slots.
  if (!isAdmin) {
    if (client_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (date <= todayInArgentina()) {
      return NextResponse.json(
        { error: "Solo se puede reservar a partir de mañana" },
        { status: 409 },
      )
    }
  }

  // The page the user booked from may be stale, so check the slot again here
  // against the schedule, the blocks and every confirmed appointment.
  let schedules
  try {
    schedules = await loadDaySchedules(supabase, [date])
  } catch (error) {
    console.error("[Appointments]", error)
    return NextResponse.json({ error: "No se pudo verificar la disponibilidad" }, { status: 500 })
  }

  const startTime = normalizeTime(start_time)
  const slotStatus = getSlotStatus(schedules[date], startTime, isAdmin)
  if (slotStatus !== "available") {
    return NextResponse.json({ error: UNAVAILABLE_SLOT_ERRORS[slotStatus] }, { status: 409 })
  }

  // Create the appointment
  const { data: appointment, error: aptError } = await supabase
    .from("appointments")
    .insert({
      client_id,
      date,
      start_time: startTime,
      end_time: addMinutes(startTime, APPOINTMENT_MINUTES),
      notes: notes || null,
      created_by: user.id,
      status: "confirmed",
    })
    .select()
    .single()

  if (aptError) {
    // 23505: unique index, another booking won the race. 23P01: the database
    // booking guard (scripts/007) found the slot booked or blocked meanwhile.
    if (aptError.code === "23505" || aptError.code === "23P01") {
      return NextResponse.json({ error: UNAVAILABLE_SLOT_ERRORS.booked }, { status: 409 })
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
    // Roll back so the slot is not left taken. Patients are not allowed to
    // delete appointments (RLS), so for them cancel it instead.
    const { data: deleted } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id)
      .select("id")
    if (!deleted?.length) {
      await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id)
    }
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  // WhatsApp notification (fire-and-forget)
  console.log("[WhatsApp] Fetching appointment details for:", appointment.id)
  const { data: details, error: detailsError } = await supabase
    .from("appointments")
    .select(`
      date, start_time,
      client:profiles!appointments_client_id_fkey(full_name, phone),
      treatments:appointment_treatments(treatment:treatments(name))
    `)
    .eq("id", appointment.id)
    .single()

  if (detailsError) {
    console.error("[WhatsApp] Details query failed:", detailsError.message)
  }

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
