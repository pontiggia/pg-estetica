'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isSameDay,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isSameMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Sparkles,
  Ban,
  CalendarOff,
  ShieldBan,
  X,
  Loader2,
  Trash2,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin-layout';
import {
  useAppointments,
  useAvailability,
  useOverrides,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import type { Appointment } from '@/lib/types';

type CalView = 'week' | 'month';

const statusColors: Record<string, string> = {
  confirmed: 'bg-primary/15 text-primary border-primary/25',
  cancelled:
    'bg-destructive/10 text-destructive border-destructive/25 line-through opacity-60',
  completed: 'bg-success/15 text-success border-success/25',
};

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
};

function generateTimeLabels(): string[] {
  const START = 8 * 60 + 30;
  const END = 20 * 60;
  const labels: string[] = [];
  let t = START;
  while (t + 60 <= END) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    labels.push(
      `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
    );
    t += 75;
  }
  return labels;
}

export default function CalendarioPage() {
  const { appointments, loading: appointmentsLoading, deleteAppointment } = useAppointments();
  const { availability, loading: availabilityLoading } = useAvailability();
  const {
    overrides,
    loading: overridesLoading,
    addOverride,
    deleteOverride,
  } = useOverrides();
  const [view, setView] = useState<CalView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loading =
    appointmentsLoading || availabilityLoading || overridesLoading;

  const [blockModal, setBlockModal] = useState<{
    open: boolean;
    date: string;
    slot: string | null;
  }>({ open: false, date: '', slot: null });
  const [blockReason, setBlockReason] = useState('');

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthCalStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const monthCalEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({
    start: monthCalStart,
    end: monthCalEnd,
  });

  const timeLabels = useMemo(() => generateTimeLabels(), []);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach((a) => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    Object.values(map).forEach((dayAppts) =>
      dayAppts.sort((a, b) => a.start_time.localeCompare(b.start_time)),
    );
    return map;
  }, [appointments]);

  const blockedMap = useMemo(() => {
    const map: Record<
      string,
      { fullDay: boolean; slots: Set<string>; reason: string | null }
    > = {};
    overrides.forEach((o) => {
      if (!o.is_blocked) return;
      if (!map[o.date])
        map[o.date] = { fullDay: false, slots: new Set(), reason: null };
      if (
        (!o.blocked_slots || o.blocked_slots.length === 0) &&
        o.start_time === null
      ) {
        map[o.date].fullDay = true;
        map[o.date].reason = o.reason;
      } else if (o.blocked_slots && o.blocked_slots.length > 0) {
        o.blocked_slots.forEach((s) => map[o.date].slots.add(s));
        if (o.reason) map[o.date].reason = o.reason;
      }
    });
    return map;
  }, [overrides]);

  const isDayBlocked = useCallback(
    (dateStr: string) => blockedMap[dateStr]?.fullDay ?? false,
    [blockedMap],
  );

  const isSlotBlocked = useCallback(
    (dateStr: string, slot: string) => {
      const entry = blockedMap[dateStr];
      if (!entry) return false;
      return entry.fullDay || entry.slots.has(slot);
    },
    [blockedMap],
  );

  const navigate = (dir: number) => {
    if (view === 'week') {
      setCurrentDate(
        dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1),
      );
    } else {
      setCurrentDate(
        dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1),
      );
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const title =
    view === 'week'
      ? `${format(weekStart, 'd MMM', { locale: es })} - ${format(weekEnd, 'd MMM yyyy', { locale: es })}`
      : format(currentDate, 'MMMM yyyy', { locale: es });

  const handleBlockDay = (dateStr: string) => {
    setBlockModal({ open: true, date: dateStr, slot: null });
    setBlockReason('');
  };

  const handleBlockSlot = (dateStr: string, slot: string) => {
    setBlockModal({ open: true, date: dateStr, slot });
    setBlockReason('');
  };

  const confirmBlock = async () => {
    if (!blockModal.date) return;
    if (blockModal.slot) {
      const existing = overrides.find(
        (o) =>
          o.date === blockModal.date &&
          o.blocked_slots &&
          o.blocked_slots.length > 0,
      );
      if (existing) {
        await deleteOverride(existing.id);
        await addOverride({
          date: blockModal.date,
          start_time: null,
          end_time: null,
          is_blocked: true,
          reason: blockReason || existing.reason,
          blocked_slots: [
            ...new Set([...existing.blocked_slots, blockModal.slot]),
          ].sort(),
        });
      } else {
        await addOverride({
          date: blockModal.date,
          start_time: null,
          end_time: null,
          is_blocked: true,
          reason: blockReason || null,
          blocked_slots: [blockModal.slot],
        });
      }
    } else {
      await addOverride({
        date: blockModal.date,
        start_time: null,
        end_time: null,
        is_blocked: true,
        reason: blockReason || null,
        blocked_slots: [],
      });
    }
    setBlockModal({ open: false, date: '', slot: null });
    setBlockReason('');
  };

  const handleUnblockDay = async (dateStr: string) => {
    const toRemove = overrides.filter(
      (o) => o.date === dateStr && o.is_blocked,
    );
    for (const o of toRemove) {
      await deleteOverride(o.id);
    }
  };

  const handleUnblockSlot = async (dateStr: string, slot: string) => {
    const existing = overrides.find(
      (o) =>
        o.date === dateStr && o.blocked_slots && o.blocked_slots.includes(slot),
    );
    if (existing) {
      const newSlots = existing.blocked_slots.filter((s) => s !== slot);
      await deleteOverride(existing.id);
      if (newSlots.length > 0) {
        await addOverride({
          date: dateStr,
          start_time: null,
          end_time: null,
          is_blocked: true,
          reason: existing.reason,
          blocked_slots: newSlots,
        });
      }
    }
  };

  const isDayOfWeekActive = useCallback(
    (dayOfWeek: number) => {
      const a = availability.find((av) => av.day_of_week === dayOfWeek);
      return a?.is_active ?? false;
    },
    [availability],
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="min-w-[220px] text-center text-sm font-semibold capitalize text-foreground">
              {title}
            </h2>
            <button
              onClick={() => navigate(1)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <Button
              variant="outline"
              size="sm"
              className="ml-2 text-xs"
              onClick={goToToday}
            >
              Hoy
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 text-[11px] text-muted-foreground md:flex">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                Confirmado
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                Completado
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                Bloqueado
              </span>
            </div>

            <div className="flex gap-1 rounded-lg border bg-card p-1">
              {(['week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    view === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* WEEK VIEW */}
        {view === 'week' && (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-[72px_repeat(7,1fr)] border-b">
                <div className="border-r bg-muted/30 px-2 py-3" />
                {weekDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isToday = isSameDay(day, new Date());
                  const dayBlocked = isDayBlocked(dateStr);
                  const isActive = isDayOfWeekActive(day.getDay());

                  return (
                    <div
                      key={dateStr}
                      className={cn(
                        'relative border-r px-2 py-3 text-center last:border-r-0',
                        isToday && 'bg-primary/5',
                        dayBlocked && 'bg-destructive/5',
                        !isActive && !dayBlocked && 'bg-muted/40',
                      )}
                    >
                      <p className="text-[11px] capitalize text-muted-foreground">
                        {format(day, 'EEE', { locale: es })}
                      </p>
                      <p
                        className={cn(
                          'text-lg font-bold',
                          isToday ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {format(day, 'd')}
                      </p>
                      {isActive && (
                        <div className="mt-1 flex justify-center gap-1">
                          {dayBlocked ? (
                            <button
                              onClick={() => handleUnblockDay(dateStr)}
                              className="flex items-center gap-0.5 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                              title="Desbloquear dia"
                            >
                              <Ban className="h-2.5 w-2.5" />
                              Bloqueado
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlockDay(dateStr)}
                              className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Bloquear dia completo"
                            >
                              <CalendarOff className="h-2.5 w-2.5" />
                              Bloquear
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {timeLabels.map((slot) => (
                <div
                  key={slot}
                  className="grid grid-cols-[72px_repeat(7,1fr)] border-b last:border-b-0"
                >
                  <div className="flex items-start border-r bg-muted/30 px-2 py-2">
                    <span className="font-mono text-[11px] font-medium text-muted-foreground">
                      {slot}
                    </span>
                  </div>

                  {weekDays.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isToday = isSameDay(day, new Date());
                    const dayBlocked = isDayBlocked(dateStr);
                    const slotBlocked = isSlotBlocked(dateStr, slot);
                    const isActive = isDayOfWeekActive(day.getDay());
                    const appt = (appointmentsByDate[dateStr] || []).find(
                      (a) => a.start_time.slice(0, 5) === slot,
                    );
                    const slotInRange = isActive;

                    return (
                      <div
                        key={`${dateStr}-${slot}`}
                        className={cn(
                          'group relative min-h-[56px] border-r p-1 last:border-r-0',
                          isToday && 'bg-primary/[0.02]',
                          dayBlocked && 'bg-destructive/[0.04]',
                          !isActive && 'bg-muted/30',
                          slotBlocked && !dayBlocked && 'bg-destructive/[0.06]',
                        )}
                      >
                        {appt ? (
                          <button
                            onClick={() => setSelectedAppointment(appt)}
                            className={cn(
                              'w-full h-full cursor-pointer border text-left transition-all bg-primary/10 text-primary p-1 rounded-none',
                              statusColors[appt.status],
                            )}
                          >
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="font-mono text-[11px] font-semibold">
                                {`${appt.start_time.slice(0, 5)}-${appt.end_time.slice(0, 5)}`}
                              </span>
                            </div>
                            {appt.client && (
                              <p className="truncate text-xs font-medium">
                                {appt.client.full_name}
                              </p>
                            )}
                          </button>
                        ) : slotBlocked && !dayBlocked ? (
                          <button
                            onClick={() => handleUnblockSlot(dateStr, slot)}
                            className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-destructive/20 bg-destructive/5 text-destructive/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title={`Desbloquear ${slot}`}
                          >
                            <ShieldBan className="h-4 w-4" />
                          </button>
                        ) : isActive && slotInRange && !dayBlocked ? (
                          <button
                            onClick={() => handleBlockSlot(dateStr, slot)}
                            className="flex h-full w-full items-center justify-center rounded-md text-transparent transition-colors group-hover:bg-muted/60 group-hover:text-muted-foreground/50"
                            title={`Bloquear ${slot}`}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MONTH VIEW */}
        {view === 'month' && (
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="grid grid-cols-7 border-b text-center">
              {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d) => (
                <div
                  key={d}
                  className="border-r px-2 py-2.5 text-xs font-semibold text-muted-foreground last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthDays.map((day, i) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayAppts = appointmentsByDate[dateStr] || [];
                const isToday = isSameDay(day, new Date());
                const inMonth = isSameMonth(day, currentDate);
                const dayBlocked = isDayBlocked(dateStr);
                const isActive = isDayOfWeekActive(day.getDay());

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      'group relative min-h-[110px] border-b border-r p-1.5',
                      i % 7 === 6 && 'border-r-0',
                      inMonth ? 'bg-card' : 'bg-muted/20',
                      isToday && 'ring-2 ring-inset ring-primary/20',
                      dayBlocked && 'bg-destructive/[0.04]',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                          !inMonth && 'text-muted-foreground/30',
                          isToday && 'bg-primary text-primary-foreground',
                          !isToday && inMonth && 'text-foreground',
                        )}
                      >
                        {format(day, 'd')}
                      </span>

                      {inMonth && isActive && (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {dayBlocked ? (
                            <button
                              onClick={() => handleUnblockDay(dateStr)}
                              className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                              title="Desbloquear"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBlockDay(dateStr)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Bloquear dia"
                            >
                              <CalendarOff className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {dayBlocked && inMonth && (
                      <div className="mb-1 flex items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5">
                        <Ban className="h-2.5 w-2.5 text-destructive" />
                        <span className="text-[9px] font-medium text-destructive">
                          Bloqueado
                        </span>
                      </div>
                    )}

                    {inMonth && !dayBlocked && dayAppts.length > 0 && (
                      <div className="space-y-0.5">
                        {dayAppts.slice(0, 3).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAppointment(a)}
                            className={cn(
                              'flex w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left transition-opacity hover:opacity-75',
                              a.status === 'confirmed' &&
                                'bg-primary/10 text-primary',
                              a.status === 'cancelled' &&
                                'bg-destructive/10 text-destructive line-through',
                              a.status === 'completed' &&
                                'bg-success/10 text-success',
                            )}
                          >
                            <span className="font-mono text-[10px] font-semibold">
                              {a.start_time}
                            </span>
                            {a.client && (
                              <span className="truncate text-[10px]">
                                {a.client.full_name.split(' ')[0]}
                              </span>
                            )}
                          </button>
                        ))}
                        {dayAppts.length > 3 && (
                          <p className="text-center text-[9px] font-medium text-muted-foreground">
                            +{dayAppts.length - 3} mas
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Appointment detail modal */}
      <Dialog
        open={selectedAppointment !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAppointment(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">
              Detalle del turno
            </DialogTitle>
            <DialogDescription>
              {selectedAppointment &&
                format(
                  new Date(selectedAppointment.date + 'T12:00:00'),
                  "EEEE d 'de' MMMM, yyyy",
                  { locale: es },
                )}
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Horario</p>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {selectedAppointment.start_time} -{' '}
                    {selectedAppointment.end_time}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paciente</p>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedAppointment.client?.full_name || 'Sin asignar'}
                  </p>
                  {selectedAppointment.client?.phone && (
                    <p className="text-xs text-muted-foreground">
                      {selectedAppointment.client.phone}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tratamientos</p>
                  {selectedAppointment.treatments &&
                  selectedAppointment.treatments.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {selectedAppointment.treatments.map((t) => (
                        <Badge
                          key={t.id}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground">
                      Sin tratamientos asignados
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Estado</span>
                <Badge
                  className={cn(
                    'text-xs',
                    selectedAppointment.status === 'confirmed' &&
                      'border-primary/20 bg-primary/15 text-primary',
                    selectedAppointment.status === 'cancelled' &&
                      'border-destructive/20 bg-destructive/15 text-destructive',
                    selectedAppointment.status === 'completed' &&
                      'border-success/20 bg-success/15 text-success',
                  )}
                  variant="outline"
                >
                  {statusLabels[selectedAppointment.status]}
                </Badge>
              </div>

              {selectedAppointment.notes && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                  <p className="mb-0.5 text-xs text-muted-foreground">Notas</p>
                  <p className="text-sm text-foreground">
                    {selectedAppointment.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedAppointment &&
            (selectedAppointment.status === 'cancelled' ||
              selectedAppointment.status === 'completed') && (
              <Button
                variant="outline"
                className="mt-2 w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                onClick={() => {
                  setDeleteId(selectedAppointment.id);
                  setSelectedAppointment(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar turno
              </Button>
            )}

          <DialogClose asChild>
            <Button variant="outline" className="mt-2 w-full">
              Cerrar
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar turno</DialogTitle>
            <DialogDescription>
              Esta accion es permanente. El turno sera eliminado y el horario quedara libre para nuevas reservas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">Volver</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteId) {
                  await deleteAppointment(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block confirmation modal */}
      <Dialog
        open={blockModal.open}
        onOpenChange={(open) => {
          if (!open) setBlockModal({ open: false, date: '', slot: null });
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-lg">
              <ShieldBan className="h-5 w-5 text-destructive" />
              {blockModal.slot ? 'Bloquear turno' : 'Bloquear dia'}
            </DialogTitle>
            <DialogDescription>
              {blockModal.date &&
                format(
                  new Date(blockModal.date + 'T12:00:00'),
                  "EEEE d 'de' MMMM, yyyy",
                  { locale: es },
                )}
              {blockModal.slot && (
                <span className="ml-1 font-mono font-semibold">
                  {' '}
                  a las {blockModal.slot}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              {blockModal.slot
                ? 'Los clientes no podran reservar este horario.'
                : 'Los clientes no podran reservar ningun turno en este dia.'}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Motivo <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                type="text"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Ej: Feriado, turno personal..."
                className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmBlock}>
              Confirmar bloqueo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
