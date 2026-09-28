import { createClient } from '@/lib/supabase/server';
import { getAvailableSlots, isValidDate } from '@/lib/availability';
import {
  loadDaySchedules,
  MAX_DATES_PER_REQUEST,
} from '@/lib/availability-server';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/slots/check-batch - Check which dates still have a free slot
// Body: { dates: ["2026-02-15", "2026-02-16", ...] }
// Response: { "2026-02-15": true, "2026-02-16": false, ... }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json().catch(() => null);
  const dates: unknown = body?.dates;

  if (
    !Array.isArray(dates) ||
    dates.length === 0 ||
    dates.length > MAX_DATES_PER_REQUEST ||
    !dates.every(isValidDate)
  ) {
    return NextResponse.json(
      { error: 'dates array is required (yyyy-mm-dd)' },
      { status: 400 },
    );
  }

  try {
    const schedules = await loadDaySchedules(supabase, dates);
    const result: Record<string, boolean> = {};
    for (const date of dates) {
      result[date] = getAvailableSlots(schedules[date]).length > 0;
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Slots]', error);
    return NextResponse.json(
      { error: 'No se pudo verificar la disponibilidad' },
      { status: 500 },
    );
  }
}
