import { createClient } from '@/lib/supabase/server';
import { getAvailableSlots, isValidDate } from '@/lib/availability';
import {
  loadDaySchedules,
  NotSignedInError,
} from '@/lib/availability-server';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/slots?date=yyyy-mm-dd - Get available time slots for a date
// &include_extra=true also returns the admin-only extra slots
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const date = request.nextUrl.searchParams.get('date');
  const includeExtra =
    request.nextUrl.searchParams.get('include_extra') === 'true';

  if (!isValidDate(date)) {
    return NextResponse.json(
      { error: 'date query param required (yyyy-mm-dd)' },
      { status: 400 },
    );
  }

  try {
    const schedules = await loadDaySchedules(supabase, [date]);
    const slots = getAvailableSlots(schedules[date], includeExtra);
    return NextResponse.json({ slots, available: slots.length > 0 });
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Slots]', error);
    return NextResponse.json(
      { error: 'No se pudo verificar la disponibilidad' },
      { status: 500 },
    );
  }
}
