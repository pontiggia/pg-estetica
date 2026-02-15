'use client';

import { useState, useMemo } from 'react';
import {
  format,
  parseISO,
  eachDayOfInterval,
  differenceInCalendarDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus,
  Trash2,
  Clock,
  Ban,
  CalendarOff,
  Palmtree,
  Loader2,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin-layout';
import { useAvailability, useOverrides } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

const dayNames = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miercoles',
  'Jueves',
  'Viernes',
  'Sabado',
];

// Generate hour options from 6:00 to 22:00 in 30-min steps
const timeOptions: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) break;
    timeOptions.push(
      `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
    );
  }
}

function TimePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  // Supabase returns time as "HH:MM:SS" but our options are "HH:MM"
  const normalised = value?.slice(0, 5) ?? '09:00';
  return (
    <select
      value={normalised}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="appearance-none rounded-lg border bg-card px-3 py-2 pr-8 font-mono text-sm font-medium text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer hover:bg-muted/50"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {timeOptions.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

type BlockType = 'full_day' | 'specific_slots' | 'vacation_range';

function generateAllSlots(startTime: string, endTime: string): string[] {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const slots: string[] = [];
  let current = startMinutes;
  while (current + 60 <= endMinutes) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(
      `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
    );
    current += 70;
  }
  return slots;
}

export default function DisponibilidadPage() {
  const {
    availability,
    loading: availabilityLoading,
    updateAvailability,
  } = useAvailability();
  const {
    overrides,
    loading: overridesLoading,
    addOverride,
    deleteOverride,
  } = useOverrides();
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [blockType, setBlockType] = useState<BlockType>('full_day');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [vacationStart, setVacationStart] = useState('');
  const [vacationEnd, setVacationEnd] = useState('');

  const loading = availabilityLoading || overridesLoading;

  const sortedAvailability = [...availability].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a.day_of_week) - order.indexOf(b.day_of_week);
  });

  const slotsForDate = useMemo(() => {
    if (!overrideDate) return [];
    const dayDate = new Date(overrideDate + 'T12:00:00');
    const dayOfWeek = dayDate.getDay();
    const dayAvail = availability.find(
      (a) => a.day_of_week === dayOfWeek && a.is_active,
    );
    if (!dayAvail) return [];
    return generateAllSlots(dayAvail.start_time, dayAvail.end_time);
  }, [overrideDate, availability]);

  const vacationDays = useMemo(() => {
    if (!vacationStart || !vacationEnd) return [];
    const start = parseISO(vacationStart);
    const end = parseISO(vacationEnd);
    if (end < start) return [];
    return eachDayOfInterval({ start, end });
  }, [vacationStart, vacationEnd]);

  const vacationDayCount = vacationDays.length;

  const handleToggleDay = async (id: string, isActive: boolean) => {
    await updateAvailability(id, { is_active: isActive });
  };

  const handleTimeChange = async (
    id: string,
    field: 'start_time' | 'end_time',
    value: string,
  ) => {
    await updateAvailability(id, { [field]: value });
  };

  const toggleSlot = (slot: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const handleAddOverride = async () => {
    if (blockType === 'vacation_range') {
      if (!vacationStart || !vacationEnd || vacationDays.length === 0) return;
      for (const day of vacationDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existing = overrides.find(
          (o) =>
            o.date === dateStr &&
            o.is_blocked &&
            o.start_time === null &&
            (!o.blocked_slots || o.blocked_slots.length === 0),
        );
        if (existing) continue;
        await addOverride({
          date: dateStr,
          start_time: null,
          end_time: null,
          is_blocked: true,
          reason:
            overrideReason ||
            `Vacaciones (${format(parseISO(vacationStart), 'd MMM', { locale: es })} - ${format(parseISO(vacationEnd), 'd MMM', { locale: es })})`,
          blocked_slots: [],
        });
      }
    } else if (blockType === 'full_day') {
      if (!overrideDate) return;
      await addOverride({
        date: overrideDate,
        start_time: null,
        end_time: null,
        is_blocked: true,
        reason: overrideReason || null,
        blocked_slots: [],
      });
    } else {
      if (!overrideDate || selectedSlots.length === 0) return;
      await addOverride({
        date: overrideDate,
        start_time: null,
        end_time: null,
        is_blocked: true,
        reason: overrideReason || null,
        blocked_slots: [...selectedSlots].sort(),
      });
    }

    resetDialog();
  };

  const resetDialog = () => {
    setOverrideDate('');
    setOverrideReason('');
    setBlockType('full_day');
    setSelectedSlots([]);
    setVacationStart('');
    setVacationEnd('');
    setShowAddOverride(false);
  };

  const groupedOverrides = useMemo(() => {
    const sorted = [...overrides].sort((a, b) => a.date.localeCompare(b.date));
    const groups: {
      type: 'single' | 'vacation';
      ids: string[];
      dates: string[];
      reason: string | null;
      blockedSlots: string[];
    }[] = [];
    const used = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;
      const o = sorted[i];
      const isFullDay = !o.blocked_slots || o.blocked_slots.length === 0;
      if (!isFullDay || !o.reason?.toLowerCase().includes('vacacion')) {
        continue;
      }
      const run = [o];
      used.add(o.id);
      for (let j = i + 1; j < sorted.length; j++) {
        const next = sorted[j];
        if (used.has(next.id)) continue;
        const isNextFullDay =
          !next.blocked_slots || next.blocked_slots.length === 0;
        if (!isNextFullDay) continue;
        const lastDate = parseISO(run[run.length - 1].date);
        const nextDate = parseISO(next.date);
        const diff = differenceInCalendarDays(nextDate, lastDate);
        if (diff <= 1 && next.reason?.toLowerCase().includes('vacacion')) {
          run.push(next);
          used.add(next.id);
        } else if (diff > 1) {
          break;
        }
      }
      if (run.length >= 2) {
        groups.push({
          type: 'vacation',
          ids: run.map((r) => r.id),
          dates: run.map((r) => r.date),
          reason: o.reason,
          blockedSlots: [],
        });
      } else {
        used.delete(o.id);
      }
    }

    for (const o of sorted) {
      if (used.has(o.id)) continue;
      groups.push({
        type: 'single',
        ids: [o.id],
        dates: [o.date],
        reason: o.reason,
        blockedSlots: o.blocked_slots || [],
      });
    }

    return groups.sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  }, [overrides]);

  const handleDeleteGroup = async (ids: string[]) => {
    for (const id of ids) {
      await deleteOverride(id);
    }
  };

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
      <div className="space-y-8">
        {/* Weekly schedule */}
        <section>
          <h2 className="mb-4 font-serif text-lg text-foreground">
            Horario semanal
          </h2>
          <div className="space-y-2">
            {sortedAvailability.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex w-32 items-center gap-3">
                  <Switch
                    checked={a.is_active}
                    onCheckedChange={(v) => handleToggleDay(a.id, v)}
                    aria-label={`Toggle ${dayNames[a.day_of_week]}`}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {dayNames[a.day_of_week]}
                  </span>
                </div>

                {a.is_active ? (
                  <div className="flex items-center gap-2">
                    <TimePicker
                      value={a.start_time}
                      onChange={(v) => handleTimeChange(a.id, 'start_time', v)}
                      label={`Hora inicio ${dayNames[a.day_of_week]}`}
                    />
                    <span className="text-sm text-muted-foreground">a</span>
                    <TimePicker
                      value={a.end_time}
                      onChange={(v) => handleTimeChange(a.id, 'end_time', v)}
                      label={`Hora fin ${dayNames[a.day_of_week]}`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Cerrado</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Overrides / exceptions */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg text-foreground">
              Excepciones y bloqueos
            </h2>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setShowAddOverride(true)}
            >
              <Plus className="h-4 w-4" />
              Agregar bloqueo
            </Button>
          </div>

          {groupedOverrides.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                No hay excepciones configuradas.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedOverrides.map((group) => {
                if (group.type === 'vacation') {
                  const startDate = parseISO(group.dates[0]);
                  const endDate = parseISO(group.dates[group.dates.length - 1]);
                  return (
                    <div
                      key={group.ids.join('-')}
                      className="flex items-start justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <Palmtree className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {format(startDate, "d 'de' MMMM", { locale: es })}{' '}
                            {' - '}
                            {format(endDate, "d 'de' MMMM yyyy", {
                              locale: es,
                            })}
                          </p>
                          {group.reason && (
                            <p className="text-xs text-muted-foreground">
                              {group.reason}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs font-medium text-primary">
                            {group.dates.length} dias bloqueados
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-0.5 h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteGroup(group.ids)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Eliminar vacaciones</span>
                      </Button>
                    </div>
                  );
                }

                const isFullDay = group.blockedSlots.length === 0;
                return (
                  <div
                    key={group.ids[0]}
                    className="flex items-start justify-between rounded-lg border bg-card px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                          isFullDay ? 'bg-destructive/10' : 'bg-warning/10',
                        )}
                      >
                        {isFullDay ? (
                          <CalendarOff className="h-4 w-4 text-destructive" />
                        ) : (
                          <Clock className="h-4 w-4 text-warning" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize text-foreground">
                          {format(
                            parseISO(group.dates[0]),
                            "EEEE d 'de' MMMM yyyy",
                            { locale: es },
                          )}
                        </p>
                        {group.reason && (
                          <p className="text-xs text-muted-foreground">
                            {group.reason}
                          </p>
                        )}
                        {isFullDay ? (
                          <p className="mt-0.5 text-xs font-medium text-destructive">
                            Dia completo bloqueado
                          </p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {group.blockedSlots.map((slot) => (
                              <Badge
                                key={slot}
                                variant="outline"
                                className="border-warning/30 bg-warning/10 font-mono text-[10px] text-warning"
                              >
                                <Ban className="mr-0.5 h-2.5 w-2.5" />
                                {slot}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-0.5 h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteGroup(group.ids)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Eliminar bloqueo</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Add override dialog */}
      <Dialog
        open={showAddOverride}
        onOpenChange={(open) => {
          if (!open) resetDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar bloqueo</DialogTitle>
            <DialogDescription>
              Bloquea un dia completo, turnos especificos o un rango de dias
              para vacaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Tipo de bloqueo
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setBlockType('full_day');
                    setSelectedSlots([]);
                    setVacationStart('');
                    setVacationEnd('');
                  }}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors',
                    blockType === 'full_day'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <CalendarOff className="h-4 w-4" />
                  Dia completo
                </button>
                <button
                  onClick={() => {
                    setBlockType('specific_slots');
                    setVacationStart('');
                    setVacationEnd('');
                  }}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors',
                    blockType === 'specific_slots'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Clock className="h-4 w-4" />
                  Turnos especificos
                </button>
                <button
                  onClick={() => {
                    setBlockType('vacation_range');
                    setOverrideDate('');
                    setSelectedSlots([]);
                  }}
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors',
                    blockType === 'vacation_range'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Palmtree className="h-4 w-4" />
                  Vacaciones
                </button>
              </div>
            </div>

            {blockType === 'vacation_range' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={vacationStart}
                    onChange={(e) => setVacationStart(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={vacationEnd}
                    min={vacationStart || undefined}
                    onChange={(e) => setVacationEnd(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {vacationDayCount > 0 && (
                  <div className="col-span-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Palmtree className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium text-foreground">
                        {vacationDayCount} dia{vacationDayCount > 1 ? 's' : ''}{' '}
                        seleccionado{vacationDayCount > 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(vacationStart), "EEEE d 'de' MMMM", {
                        locale: es,
                      })}{' '}
                      {' - '}
                      {format(parseISO(vacationEnd), "EEEE d 'de' MMMM yyyy", {
                        locale: es,
                      })}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Fecha
                </label>
                <input
                  type="date"
                  value={overrideDate}
                  onChange={(e) => {
                    setOverrideDate(e.target.value);
                    setSelectedSlots([]);
                  }}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Motivo <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={
                  blockType === 'vacation_range'
                    ? 'Ej: Vacaciones de verano'
                    : 'Ej: Feriado, Turno personal'
                }
                className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {blockType === 'specific_slots' && overrideDate && (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Selecciona los turnos a bloquear
                </label>
                {slotsForDate.length === 0 ? (
                  <p className="rounded-lg border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                    No hay turnos disponibles en esta fecha (dia cerrado).
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slotsForDate.map((slot) => {
                      const isSelected = selectedSlots.includes(slot);
                      return (
                        <button
                          key={slot}
                          onClick={() => toggleSlot(slot)}
                          className={cn(
                            'rounded-lg border px-3 py-2 font-mono text-sm font-medium transition-colors',
                            isSelected
                              ? 'border-destructive bg-destructive/10 text-destructive'
                              : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                          )}
                        >
                          {isSelected && (
                            <Ban className="mb-0.5 mr-1 inline h-3 w-3" />
                          )}
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedSlots.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedSlots.length} turno
                    {selectedSlots.length > 1 ? 's' : ''} seleccionado
                    {selectedSlots.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {blockType === 'specific_slots' && !overrideDate && (
              <p className="rounded-lg border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                Selecciona una fecha para ver los turnos disponibles.
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddOverride}
              disabled={
                (blockType === 'full_day' && !overrideDate) ||
                (blockType === 'specific_slots' &&
                  (!overrideDate || selectedSlots.length === 0)) ||
                (blockType === 'vacation_range' &&
                  (!vacationStart || !vacationEnd || vacationDayCount === 0))
              }
            >
              {blockType === 'vacation_range'
                ? 'Bloquear vacaciones'
                : 'Agregar bloqueo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
