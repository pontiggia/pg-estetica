"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { Search, Phone, Mail, CalendarDays, Loader2 } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { useClients, useAppointments } from "@/hooks/use-api"

export default function ClientesPage() {
  const { clients, loading: clientsLoading } = useClients()
  const { appointments, loading: appointmentsLoading } = useAppointments()
  const [search, setSearch] = useState("")

  const loading = clientsLoading || appointmentsLoading

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase()
    return clients
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q))
      )
      .map((c) => ({
        ...c,
        appointmentCount: appointments.filter((a) => a.client_id === c.id).length,
        lastAppointment: appointments
          .filter((a) => a.client_id === c.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
      }))
  }, [clients, appointments, search])

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
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado{clients.length !== 1 ? "s" : ""}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-64 rounded-lg border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Client cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredClients.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-semibold text-primary">
                    {c.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {format(parseISO(c.created_at), "MMM yyyy", { locale: es })}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{c.email}</span>
                </div>
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{c.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>
                    {c.appointmentCount} turno{c.appointmentCount !== 1 ? "s" : ""}
                    {c.lastAppointment && (
                      <>
                        {" - ultimo: "}
                        {format(parseISO(c.lastAppointment), "d MMM", { locale: es })}
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? "No se encontraron clientes con esa busqueda." : "No hay clientes registrados."}
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
