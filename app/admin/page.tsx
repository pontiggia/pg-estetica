"use client"

import { useMemo } from "react"
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarDays, Users, Clock, TrendingUp, Loader2 } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { AppointmentCard } from "@/components/booking/appointment-card"
import { useAppointments, useClients } from "@/hooks/use-api"

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { appointments, loading: appointmentsLoading } = useAppointments()
  const { clients, loading: clientsLoading } = useClients()

  const loading = appointmentsLoading || clientsLoading

  const today = new Date()
  const todayStr = format(today, "yyyy-MM-dd")
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

  const stats = useMemo(() => {
    const todayAppts = appointments.filter(
      (a) => a.date === todayStr && a.status === "confirmed"
    )
    const weekAppts = appointments.filter((a) => {
      const d = parseISO(a.date)
      return a.status === "confirmed" && isWithinInterval(d, { start: weekStart, end: weekEnd })
    })
    const confirmed = appointments.filter((a) => a.status === "confirmed")
    return {
      today: todayAppts.length,
      week: weekAppts.length,
      clients: clients.length,
      confirmed: confirmed.length,
    }
  }, [appointments, clients, todayStr, weekStart, weekEnd])

  const upcomingToday = useMemo(
    () =>
      appointments
        .filter((a) => a.date === todayStr && a.status === "confirmed")
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [appointments, todayStr]
  )

  const upcomingNext = useMemo(
    () =>
      appointments
        .filter((a) => a.date > todayStr && a.status === "confirmed")
        .sort((a, b) => {
          const cmp = a.date.localeCompare(b.date)
          return cmp !== 0 ? cmp : a.start_time.localeCompare(b.start_time)
        })
        .slice(0, 5),
    [appointments, todayStr]
  )

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
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Turnos hoy" value={stats.today} icon={CalendarDays} />
          <StatCard label="Esta semana" value={stats.week} icon={Clock} />
          <StatCard label="Clientes" value={stats.clients} icon={Users} />
          <StatCard label="Confirmados" value={stats.confirmed} icon={TrendingUp} />
        </div>

        {/* Today's appointments */}
        <section>
          <h2 className="mb-3 font-serif text-lg text-foreground">
            Turnos de hoy
            <span className="ml-2 text-sm font-normal capitalize text-muted-foreground">
              {format(today, "EEEE d 'de' MMMM", { locale: es })}
            </span>
          </h2>
          {upcomingToday.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">No hay turnos para hoy.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingToday.map((a) => (
                <AppointmentCard key={a.id} appointment={a} showClient />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming */}
        <section>
          <h2 className="mb-3 font-serif text-lg text-foreground">Proximos turnos</h2>
          {upcomingNext.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">No hay turnos proximos.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingNext.map((a) => (
                <AppointmentCard key={a.id} appointment={a} showClient />
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
