"use client"

import { useState, useMemo } from "react"
import { CalendarDays, Plus, Loader2 } from "lucide-react"
import { ClientLayout } from "@/components/client-layout"
import { AppointmentCard } from "@/components/booking/appointment-card"
import { useAppointments, useProfile } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import Link from "next/link"

export default function MisTurnosPage() {
  const { profile, loading: profileLoading } = useProfile()
  const { appointments: allAppointments, loading: appointmentsLoading, updateAppointmentStatus } = useAppointments(
    profile?.id ? { client_id: profile.id } : undefined
  )
  const [cancelId, setCancelId] = useState<string | null>(null)

  const loading = profileLoading || appointmentsLoading

  const myAppointments = useMemo(
    () =>
      [...allAppointments].sort((a, b) => {
        const dateA = `${a.date}T${a.start_time}`
        const dateB = `${b.date}T${b.start_time}`
        return dateB.localeCompare(dateA)
      }),
    [allAppointments]
  )

  const upcoming = myAppointments.filter((a) => a.status === "confirmed")
  const past = myAppointments.filter((a) => a.status !== "confirmed")

  const handleCancel = async () => {
    if (cancelId) {
      await updateAppointmentStatus(cancelId, "cancelled", "Cancelado por la clienta")
      setCancelId(null)
    }
  }

  return (
    <ClientLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-2xl text-foreground">Mis Turnos</h1>
          <Link href="/">
            <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              Nuevo turno
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : myAppointments.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <CalendarDays className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-1 font-serif text-lg text-foreground">No tenes turnos</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Reserva tu primer turno para comenzar.
            </p>
            <Link href="/">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Reservar turno
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Proximos
                </h2>
                <div className="space-y-3">
                  {upcoming.map((a) => (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      onCancel={(id) => setCancelId(id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Historial
                </h2>
                <div className="space-y-3">
                  {past.map((a) => (
                    <AppointmentCard key={a.id} appointment={a} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar turno</DialogTitle>
            <DialogDescription>
              Estas segura de que queres cancelar este turno? Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Volver</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleCancel}
            >
              Cancelar turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  )
}
