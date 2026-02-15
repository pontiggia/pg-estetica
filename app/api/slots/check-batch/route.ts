import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/slots/check-batch - Check availability for multiple dates in one call
// Body: { dates: ["2026-02-15", "2026-02-16", ...] }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const dates: string[] = body.dates;

  if (!Array.isArray(dates) || dates.length === 0) {
    return NextResponse.json(
      { error: 'dates array is required' },
      { status: 400 },
    );
  }

  // 1) Fetch the full weekly schedule in one query
  const { data: availability } = await supabase
    .from('availability')
    .select('day_of_week, is_active')
    .eq('is_active', true);

  const activeDays = new Set((availability ?? []).map((a) => a.day_of_week));

  // 2) Fetch all full-day overrides for the requested dates in one query
  const { data: overrides } = await supabase
    .from('availability_overrides')
    .select('date, blocked_slots, is_blocked')
    .in('date', dates)
    .eq('is_blocked', true);

  const fullDayBlocked = new Set<string>();
  for (const o of overrides ?? []) {
    // Full-day block = no blocked_slots (or empty array)
    if (!o.blocked_slots || o.blocked_slots.length === 0) {
      fullDayBlocked.add(o.date);
    }
  }

  // 3) Build the result map
  const result: Record<string, boolean> = {};
  for (const date of dates) {
    const dayDate = new Date(date + 'T12:00:00');
    const dayOfWeek = dayDate.getDay();

    if (!activeDays.has(dayOfWeek)) {
      result[date] = false;
    } else if (fullDayBlocked.has(date)) {
      result[date] = false;
    } else {
      result[date] = true;
    }
  }

  return NextResponse.json(result);
}
