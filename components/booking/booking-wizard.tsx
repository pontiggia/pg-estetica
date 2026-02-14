"use client"

import { useState, useEffect, useCallback } from "react"
import { format, isBefore, isToday, startOfDay, isSameMonth, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns"
import { es } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Check, ArrowLeft, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTreatments, useAvailableSlots, checkDateAvailability, useProfile } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

type Step = 1 | 2 | 3 | 4

interface BookingWizardProps {
  onComplete: () => void
}

export function BookingWizard({ onComplete }: BookingWizardProps) {
  const [step, setStep] = useState<Step>(1)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [submitting, setSubmitting] = useState(false)

  const { activeTreatments, loading: treatmentsLoading } = useTreatments()
  const { profile } = useProfile()

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null
  const { slots: availableSlots, loading: slotsLoading } = useAvailableSlots(dateStr)

  // Track date availability for calendar rendering
  const [dateAvailability, setDateAvailability] = useState<Record<string, boolean>>({})

  // Calendar logic
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const today = startOfDay(new Date())

  // Check availability for all visible days in current month
  useEffect(() => {
    const futureDays = calendarDays.filter(
      (day) => !isBefore(day, today) && !isToday(day) && isSameMonth(day, currentMonth)
    )
    let cancelled = false

    async function checkAll() {
      const results: Record<string, boolean> = {}
      await Promise.all(
        futureDays.map(async (day) => {
          const ds = format(day, "yyyy-MM-dd")
          const available = await checkDateAvailability(ds)
          if (!cancelled) results[ds] = available
        })
      )
      if (!cancelled) setDateAvailability((prev) => ({ ...prev, ...results }))
    }

    checkAll()
    return () => { cancelled = true }
  }, [currentMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTreatment = useCallback((id: string) => {
    setSelectedTreatments((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!selectedDate || !selectedTime || selectedTreatments.length === 0 || !profile) return

    const [h, m] = selectedTime.split(":").map(Number)
    const endH = h + 1
    const endTime = `${endH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`

    setSubmitting(true)
    try {
      await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: profile.id,
          date: format(selectedDate, "yyyy-MM-dd"),
          start_time: selectedTime,
          end_time: endTime,
          treatment_ids: selectedTreatments,
          created_by: profile.id,
        }),
      })
      setStep(4)
    } catch {
      // Could show error toast here
    } finally {
      setSubmitting(false)
    }
  }, [selectedDate, selectedTime, selectedTreatments, profile])

  const isDateSelectable = useCallback(
    (day: Date) => {
      if (isBefore(day, today) || isToday(day)) return false
      if (!isSameMonth(day, currentMonth)) return false
      const ds = format(day, "yyyy-MM-dd")
      return dateAvailability[ds] ?? false
    },
    [currentMonth, today, dateAvailability]
  )

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* Step indicator */}
      {step < 4 && (
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-2 w-8 rounded-full transition-colors duration-200",
                s <= step ? "bg-primary" : "bg-border"
              )}
            />
          ))}
          <span className="ml-3 text-sm text-muted-foreground">
            {"Paso"} {step}/3
          </span>
        </div>
      )}

      {/* Step 1: Date selection */}
      {step === 1 && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 font-serif text-xl text-foreground">
            Selecciona una fecha
          </h2>

          {/* Month navigation */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              disabled={isSameMonth(currentMonth, new Date())}
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Mes anterior</span>
            </button>
            <span className="text-sm font-medium capitalize text-foreground">
              {format(currentMonth, "MMMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-5 w-5" />
              <span className="sr-only">Mes siguiente</span>
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((d) => (
              <div key={d} className="py-2 text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const selectable = isDateSelectable(day)
              const isSelected = selectedDate && isSameDay(day, selectedDate)
              const inMonth = isSameMonth(day, currentMonth)

              return (
                <button
                  key={day.toISOString()}
                  disabled={!selectable}
                  onClick={() => {
                    setSelectedDate(day)
                    setSelectedTime(null)
                    setStep(2)
                  }}
                  className={cn(
                    "flex h-10 w-full items-center justify-center rounded-md text-sm transition-colors duration-200",
                    !inMonth && "text-transparent",
                    inMonth && !selectable && "text-muted-foreground/40 cursor-not-allowed",
                    inMonth && selectable && "text-foreground hover:bg-primary/10 cursor-pointer",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {format(day, "d")}
                </button>
              )
            })}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            No se puede reservar para el dia de hoy
          </p>
        </div>
      )}

      {/* Step 2: Time selection */}
      {step === 2 && selectedDate && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <button
            onClick={() => setStep(1)}
            className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Cambiar fecha
          </button>

          <h2 className="mb-1 font-serif text-xl text-foreground">
            Horarios disponibles
          </h2>
          <p className="mb-4 text-sm capitalize text-muted-foreground">
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </p>

          {slotsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay horarios disponibles para esta fecha.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setStep(1)}
              >
                Elegir otra fecha
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => {
                    setSelectedTime(slot)
                    setStep(3)
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-3 font-mono text-sm font-medium transition-all duration-200",
                    selectedTime === slot
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5"
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Treatment selection + confirm */}
      {step === 3 && selectedDate && selectedTime && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <button
            onClick={() => setStep(2)}
            className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Cambiar horario
          </button>

          <h2 className="mb-1 font-serif text-xl text-foreground">
            Selecciona tratamiento(s)
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="capitalize">
              {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
            </span>
            {" a las "}
            <span className="font-mono">{selectedTime}</span>
          </p>

          {treatmentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2">
              {activeTreatments.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-200",
                    selectedTreatments.includes(t.id)
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={selectedTreatments.includes(t.id)}
                    onCheckedChange={() => toggleTreatment(t.id)}
                  />
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                </label>
              ))}
            </div>
          )}

          <Button
            className="mt-6 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            size="lg"
            disabled={selectedTreatments.length === 0 || submitting}
            onClick={handleConfirm}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Confirmar turno
          </Button>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && selectedDate && selectedTime && (
        <div className="rounded-lg border bg-card p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h2 className="mb-2 font-serif text-2xl text-foreground">
            Turno confirmado
          </h2>
          <p className="mb-1 text-sm capitalize text-muted-foreground">
            {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
          <p className="mb-6 font-mono text-lg font-medium text-foreground">
            {selectedTime} hs
          </p>
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {selectedTreatments.map((id) => {
              const t = activeTreatments.find((tr) => tr.id === id)
              return t ? (
                <span
                  key={id}
                  className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                >
                  {t.name}
                </span>
              ) : null
            })}
          </div>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onComplete}
          >
            Ver mis turnos
          </Button>
        </div>
      )}
    </div>
  )
}
