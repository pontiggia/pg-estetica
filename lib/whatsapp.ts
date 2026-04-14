import { format } from "date-fns"
import { es } from "date-fns/locale"

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

async function sendTemplate(templateName: string, params: string[]): Promise<void> {
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const adminPhone = process.env.WHATSAPP_ADMIN_PHONE

  if (!token || !phoneNumberId || !adminPhone) {
    console.warn("[WhatsApp] Missing env vars:", { token: !!token, phoneNumberId: !!phoneNumberId, adminPhone: !!adminPhone })
    return
  }

  console.log("[WhatsApp] Sending template:", templateName, "to:", adminPhone, "params:", params)

  const body: WhatsAppTemplateMessage = {
    messaging_product: "whatsapp",
    to: adminPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text" as const, text })),
        },
      ],
    },
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error("[WhatsApp] Send failed:", res.status, err)
  } else {
    const result = await res.json()
    console.log("[WhatsApp] Send success:", JSON.stringify(result))
  }
}

function formatDate(dateStr: string): string {
  return format(new Date(dateStr + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

export function notifyNewAppointment(details: {
  clientName: string
  date: string
  time: string
  treatments: string
  clientPhone: string
}): void {
  const templateName = process.env.WHATSAPP_TEMPLATE_NEW || "nueva_cita"
  sendTemplate(templateName, [
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
  const templateName = process.env.WHATSAPP_TEMPLATE_CANCELLED || "cita_cancelada"
  sendTemplate(templateName, [
    details.clientName,
    formatDate(details.date),
    formatTime(details.time),
    details.clientPhone,
  ]).catch((err) => console.error("[WhatsApp] notifyCancelledAppointment error:", err))
}
