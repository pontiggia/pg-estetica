"use client"

import { format, parseISO, differenceInHours } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarDays, Clock, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Appointment } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const statusConfig = {
  confirmed: { label: "Confirmado", className: "bg-primary/10 text-primary border-primary/20" },
  cancelled: { label: "Cancelado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  completed: { label: "Completado", className: "bg-success/10 text-success border-success/20" },
}

interface AppointmentCardProps {
  appointment: Appointment
  onCancel?: (id: string) => void
  showClient?: boolean
}

export function AppointmentCard({ appointment, onCancel, showClient }: AppointmentCardProps) {
  const appointmentDate = parseISO(`${appointment.date}T${appointment.start_time}`)
  const hoursUntil = differenceInHours(appointmentDate, new Date())
  const canCancel = appointment.status === "confirmed" && hoursUntil > 24
  const status = statusConfig[appointment.status]

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {showClient && appointment.client && (
            <p className="mb-1 text-sm font-medium text-foreground">
              {appointment.client.full_name}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="capitalize">
                {format(parseISO(appointment.date), "EEE d MMM", { locale: es })}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono text-xs">
                {appointment.start_time} - {appointment.end_time}
              </span>
            </span>
          </div>

          {appointment.treatments && appointment.treatments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {appointment.treatments.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {appointment.notes && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              {appointment.notes}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge
            variant="outline"
            className={cn("text-xs", status.className)}
          >
            {status.label}
          </Badge>

          {canCancel && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onCancel(appointment.id)}
            >
              <X className="h-3 w-3" />
              Cancelar
            </Button>
          )}

          {appointment.status === "confirmed" && !canCancel && hoursUntil <= 24 && hoursUntil > 0 && (
            <span className="text-xs text-muted-foreground">
              {"< 24hs, no cancelable"}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
