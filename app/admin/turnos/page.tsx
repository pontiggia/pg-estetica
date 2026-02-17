"use client"

import { useMemo, useState } from "react"
import { Search, Loader2, Trash2 } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { AppointmentCard } from "@/components/booking/appointment-card"
import { useAppointments } from "@/hooks/use-api"
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
import { cn } from "@/lib/utils"
import type { AppointmentStatus } from "@/lib/types"

const statusFilters: { value: "all" | AppointmentStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "confirmed", label: "Confirmados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "completed", label: "Completados" },
]

export default function TurnosPage() {
  const { appointments, loading, updateAppointmentStatus, deleteAppointment } = useAppointments()
  const [statusFilter, setStatusFilter] = useState<"all" | AppointmentStatus>("all")
  const [search, setSearch] = useState("")
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [completeId, setCompleteId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return appointments
      .filter((a) => {
        if (statusFilter !== "all" && a.status !== statusFilter) return false
        if (q && a.client?.full_name && !a.client.full_name.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const cmp = b.date.localeCompare(a.date)
        return cmp !== 0 ? cmp : b.start_time.localeCompare(a.start_time)
      })
  }, [appointments, statusFilter, search])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente..."
              className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {filtered.length} turno{filtered.length !== 1 ? "s" : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">No se encontraron turnos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <div key={a.id} className="group relative">
                <AppointmentCard
                  appointment={a}
                  showClient
                  onCancel={a.status === "confirmed" ? (id) => setCancelId(id) : undefined}
                />
                {a.status === "confirmed" && (
                  <div className="mt-1 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setCompleteId(a.id)}
                    >
                      Marcar completado
                    </Button>
                  </div>
                )}
                {(a.status === "cancelled" || a.status === "completed") && (
                  <div className="mt-1 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      onClick={() => setDeleteId(a.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar turno</DialogTitle>
            <DialogDescription>
              Como admin, podes cancelar cualquier turno sin restriccion de 24hs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Volver</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (cancelId) {
                  await updateAppointmentStatus(cancelId, "cancelled", "Cancelado por admin")
                  setCancelId(null)
                }
              }}
            >
              Cancelar turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={!!completeId} onOpenChange={() => setCompleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar turno</DialogTitle>
            <DialogDescription>
              Marcar este turno como completado?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Volver</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={async () => {
                if (completeId) {
                  await updateAppointmentStatus(completeId, "completed")
                  setCompleteId(null)
                }
              }}
            >
              Completar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar turno</DialogTitle>
            <DialogDescription>
              Esta accion es permanente. El turno sera eliminado y el horario quedara libre para nuevas reservas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Volver</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteId) {
                  await deleteAppointment(deleteId)
                  setDeleteId(null)
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
