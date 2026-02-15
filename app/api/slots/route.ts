import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/slots?date=yyyy-mm-dd - Get available time slots for a date
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const date = request.nextUrl.searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'date query param required' },
      { status: 400 },
    );
  }

  // Determine day of week
  const dayDate = new Date(date + 'T12:00:00');
  const dayOfWeek = dayDate.getDay();

  // Fetch availability for this day
  const { data: availData } = await supabase
    .from('availability')
    .select('*')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .single();

  if (!availData) {
    return NextResponse.json({ slots: [], available: false });
  }

  // Check for full day blocks
  const { data: overrides } = await supabase
    .from('availability_overrides')
    .select('*')
    .eq('date', date);

  const fullDayBlock = overrides?.find(
    (o) =>
      o.is_blocked &&
      !o.start_time &&
      !o.end_time &&
      (!o.blocked_slots || o.blocked_slots.length === 0),
  );
  if (fullDayBlock) {
    return NextResponse.json({ slots: [], available: false });
  }

  // Fetch confirmed appointments for this date
  const { data: appointments } = await supabase
    .from('appointments')
    .select('start_time')
    .eq('date', date)
    .eq('status', 'confirmed');

  const takenSlots = new Set(
    (appointments ?? []).map((a) => a.start_time.slice(0, 5)),
  );

  // Generate 75-minute interval slots (60min appointment + 15min buffer)
  const [startH, startM] = availData.start_time.split(':').map(Number);
  const [endH, endM] = availData.end_time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const slots: string[] = [];
  let current = startMinutes;

  while (current + 60 <= endMinutes) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    // Check if blocked by override
    const isBlocked = overrides?.some((o) => {
      if (!o.is_blocked) return false;
      if (o.blocked_slots && o.blocked_slots.length > 0) {
        return o.blocked_slots.some((s: string) => s.slice(0, 5) === timeStr);
      }
      if (!o.start_time || !o.end_time) return false;
      const [oSH, oSM] = o.start_time.split(':').map(Number);
      const [oEH, oEM] = o.end_time.split(':').map(Number);
      const oStart = oSH * 60 + oSM;
      const oEnd = oEH * 60 + oEM;
      return current >= oStart && current < oEnd;
    });

    if (!isBlocked && !takenSlots.has(timeStr)) {
      slots.push(timeStr);
    }

    current += 75;
  }

  return NextResponse.json({ slots, available: true });
}
