import { format } from "date-fns"
import { es } from "date-fns/locale"

const WHATSAPP_API_VERSION = "v25.0"
const TEMPLATE_LANGUAGE = "es"

interface WhatsAppTemplateMessage {
  messaging_product: "whatsapp"
  to: string
  type: "template"
  template: {
    name: string
    language: { code: string }
    components: Array<{
      type: "body"
      parameters: Array<{ type: "text"; text: string }>
    }>
  }
}

/**
 * Normalizes an Argentine phone number to the international WhatsApp format
 * (549 + area code + number, 13 digits). Returns null when the input cannot be
 * interpreted as a valid Argentine mobile number.
 *
 * Handles the common ways patients type their number:
 *   "11 2345-6789"        -> 5491123456789
 *   "011 15 2345 6789"    -> 5491123456789
 *   "+54 9 11 2345 6789"  -> 5491123456789
 *   "54 11 2345 6789"     -> 5491123456789
 *   "0351 15 234 5678"    -> 5493512345678
 */
export function normalizeArgentinePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, "")
  if (!digits) return null

  // Strip international prefix "00" (e.g. 0054...)
  if (digits.startsWith("0054")) digits = digits.slice(2)

  if (digits.startsWith("54")) {
    // Already international. Ensure the mobile "9" is present.
    digits = digits.slice(2)
    if (digits.startsWith("9")) digits = digits.slice(1)
  }

  // Strip national trunk prefix "0"
  if (digits.startsWith("0")) digits = digits.slice(1)

  // Remove the "15" mobile prefix that follows the area code (2 to 4 digits)
  if (digits.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (digits.slice(areaLen, areaLen + 2) === "15") {
        digits = digits.slice(0, areaLen) + digits.slice(areaLen + 2)
        break
      }
    }
  }

  // Area code + subscriber number must be exactly 10 digits in Argentina
  if (digits.length !== 10) return null

  return `549${digits}`
}

/**
 * Sends a WhatsApp template message. Never throws: any failure is logged and
 * reported as `false` so callers can decide what to do (e.g. not marking a
 * reminder as sent). WhatsApp failures must never affect the booking itself.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  params: string[],
): Promise<boolean> {
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    console.warn("[WhatsApp] Missing env vars:", {
      token: !!token,
      phoneNumberId: !!phoneNumberId,
    })
    return false
  }

  if (!templateName) {
    console.warn("[WhatsApp] No template name configured, skipping send to:", to)
    return false
  }

  console.log("[WhatsApp] Sending template:", templateName, "to:", to, "params:", params)

  const body: WhatsAppTemplateMessage = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: TEMPLATE_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text" as const, text })),
        },
      ],
    },
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      console.error("[WhatsApp] Send failed:", res.status, err)
      return false
    }

    const result = await res.json()
    console.log("[WhatsApp] Send success:", JSON.stringify(result))
    return true
  } catch (err) {
    console.error("[WhatsApp] Send error:", err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (dates are stored as "yyyy-MM-dd" and "HH:mm[:ss]" in
// Argentina local time)
// ---------------------------------------------------------------------------

export function formatDate(dateStr: string): string {
  // Parsing at noon avoids any day shift regardless of the server timezone.
  return format(new Date(dateStr + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })
}

export function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Admin notifications (Paula)
// ---------------------------------------------------------------------------

export function notifyNewAppointment(details: {
  clientName: string
  date: string
  time: string
  treatments: string
  clientPhone: string
}): void {
  const adminPhone = process.env.WHATSAPP_ADMIN_PHONE
  if (!adminPhone) {
    console.warn("[WhatsApp] WHATSAPP_ADMIN_PHONE not set, skipping admin notification")
    return
  }
  const templateName = process.env.WHATSAPP_TEMPLATE_NEW || "nueva_cita"
  sendTemplate(adminPhone, templateName, [
    details.clientName,
    formatDate(details.date),
    formatTime(details.time),
    details.treatments,
    details.clientPhone,
  ]).catch((err) => console.error("[WhatsApp] notifyNewAppointment error:", err))
}

export function notifyCancelledAppointment(details: {
  clientName: string
  date: string
  time: string
  clientPhone: string
}): void {
  const adminPhone = process.env.WHATSAPP_ADMIN_PHONE
  if (!adminPhone) {
    console.warn("[WhatsApp] WHATSAPP_ADMIN_PHONE not set, skipping admin notification")
    return
  }
  const templateName = process.env.WHATSAPP_TEMPLATE_CANCELLED || "cita_cancelada"
  sendTemplate(adminPhone, templateName, [
    details.clientName,
    formatDate(details.date),
    formatTime(details.time),
    details.clientPhone,
  ]).catch((err) => console.error("[WhatsApp] notifyCancelledAppointment error:", err))
}

// ---------------------------------------------------------------------------
// Client (patient) messages
// ---------------------------------------------------------------------------

export interface ClientMessageDetails {
  clientName: string
  clientPhone: string | null
  date: string
  time: string
  treatments: string
}

function clientTemplateParams(details: ClientMessageDetails): string[] {
  // Template body: {{1}} name, {{2}} date, {{3}} time, {{4}} treatment(s)
  return [
    details.clientName,
    formatDate(details.date),
    formatTime(details.time),
    details.treatments,
  ]
}

/**
 * Sends the booking confirmation template to the patient.
 * Resolves to true only when WhatsApp accepted the message.
 */
export async function sendClientConfirmation(details: ClientMessageDetails): Promise<boolean> {
  const to = normalizeArgentinePhone(details.clientPhone)
  if (!to) {
    console.warn("[WhatsApp] Invalid client phone, skipping confirmation:", details.clientPhone)
    return false
  }
  const templateName = process.env.WHATSAPP_TEMPLATE_CLIENT_CONFIRMED || ""
  return sendTemplate(to, templateName, clientTemplateParams(details))
}

/**
 * Sends the ~24h reminder template (with the cancellation policy) to the patient.
 * Resolves to true only when WhatsApp accepted the message.
 */
export async function sendClientReminder(details: ClientMessageDetails): Promise<boolean> {
  const to = normalizeArgentinePhone(details.clientPhone)
  if (!to) {
    console.warn("[WhatsApp] Invalid client phone, skipping reminder:", details.clientPhone)
    return false
  }
  const templateName = process.env.WHATSAPP_TEMPLATE_CLIENT_REMINDER || ""
  return sendTemplate(to, templateName, clientTemplateParams(details))
}
