import { createAdminClient } from "@/lib/supabase/admin"
import { argentinaDateString } from "@/lib/timezone"
import { sendClientReminder } from "@/lib/whatsapp"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000

interface PendingReminder {
  id: string
  date: string
  start_time: string
  client: { full_name: string; phone: string | null } | null
  treatments: Array<{ treatment: { name: string } | null }> | null
}

/**
 * GET /api/cron/reminders
 *
 * Sends the WhatsApp reminder to patients with a confirmed appointment on the
 * next calendar day (Argentina time). Meant to be invoked once a day by Vercel
 * Cron (Hobby plans only allow daily crons); scheduled in the morning so the
 * reminder arrives roughly 24 hours before the appointment.
 * Protected with `Authorization: Bearer CRON_SECRET`.
 *
 * Each appointment is "claimed" by setting reminder_sent_at before sending, so
 * two overlapping runs can never send the same reminder twice. If WhatsApp
 * rejects the message the claim is released and the next run retries.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[Reminders] CRON_SECRET is not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (err) {
    console.error("[Reminders]", err)
    return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 })
  }

  const tomorrow = argentinaDateString(new Date(Date.now() + DAY_MS))

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id, date, start_time,
      client:profiles!appointments_client_id_fkey(full_name, phone),
      treatments:appointment_treatments(treatment:treatments(name))
    `)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .eq("date", tomorrow)
    .order("start_time", { ascending: true })

  if (error) {
    console.error("[Reminders] Query failed:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const candidates = (data ?? []) as unknown as PendingReminder[]
  const summary = { date: tomorrow, checked: candidates.length, sent: 0, skipped: 0, failed: 0 }

  for (const apt of candidates) {
    if (!apt.client) {
      summary.skipped++
      continue
    }

    // Claim the reminder atomically: only one run can flip null -> timestamp.
    const { data: claimed, error: claimError } = await supabase
      .from("appointments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", apt.id)
      .is("reminder_sent_at", null)
      .select("id")

    if (claimError || !claimed || claimed.length === 0) {
      if (claimError) console.error("[Reminders] Claim failed:", apt.id, claimError.message)
      summary.skipped++
      continue
    }

    const treatments =
      apt.treatments
        ?.map((at) => at.treatment?.name)
        .filter((name): name is string => Boolean(name))
        .join(", ") || "—"

    const ok = await sendClientReminder({
      clientName: apt.client.full_name,
      clientPhone: apt.client.phone,
      date: apt.date,
      time: apt.start_time,
      treatments,
    })

    if (ok) {
      summary.sent++
    } else {
      summary.failed++
      // Release the claim so a later run (or a manual re-run) can retry.
      const { error: releaseError } = await supabase
        .from("appointments")
        .update({ reminder_sent_at: null })
        .eq("id", apt.id)
      if (releaseError) console.error("[Reminders] Release failed:", apt.id, releaseError.message)
    }
  }

  console.log("[Reminders] Run summary:", JSON.stringify(summary))
  return NextResponse.json(summary)
}
