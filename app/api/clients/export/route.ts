import { createClient } from '@/lib/supabase/server';
import { todayInArgentina } from '@/lib/availability';
import {
  buildPatientWorkbook,
  patientWorkbookFileName,
} from '@/lib/patient-workbook';
import { NextResponse } from 'next/server';

// Supabase returns at most "max rows" (1000 by default) rows per request, so
// both lists are read page by page. A file with missing patients is never
// sent: running out of pages is an error.
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

type Page<T> = PromiseLike<{
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
}>;

async function readAllPages<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, count, error } = await page(
      rows.length,
      rows.length + PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    if (count !== null && rows.length >= count) return rows;
  }
  throw new Error(`More than ${MAX_PAGES} pages`);
}

interface ClientRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface AppointmentRow {
  id: string;
  client_id: string;
  date: string;
  start_time: string;
  status: string;
  treatments: { treatment: Treatment | Treatment[] | null }[] | null;
}

interface Treatment {
  name: string;
}

// PostgREST embeds each link's treatment as one object (many-to-one), while
// the inferred types say array; both are read.
function treatmentNames(links: AppointmentRow['treatments']): string[] {
  return (links ?? []).flatMap(({ treatment }) =>
    (Array.isArray(treatment) ? treatment : treatment ? [treatment] : []).map(
      (t) => t.name,
    ),
  );
}

// Argentina date of a timestamp (todayInArgentina works for any instant)
function argentinaDate(timestamp: string | null): string | null {
  const date = new Date(timestamp ?? '');
  return Number.isNaN(date.getTime()) ? null : todayInArgentina(date);
}

// GET /api/clients/export - Every client, with the appointment history, in
// Paula's "Fichero Digital de Pacientes" Excel workbook (admin only)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [clients, appointments] = await Promise.all([
      readAllPages<ClientRow>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, email, phone, created_at', {
            count: 'exact',
          })
          .eq('role', 'client')
          // Unique order so pages never overlap or skip rows
          .order('id', { ascending: true })
          .range(from, to),
      ),
      readAllPages<AppointmentRow>((from, to) =>
        supabase
          .from('appointments')
          .select(
            'id, client_id, date, start_time, status, treatments:appointment_treatments(treatment:treatments(name))',
            { count: 'exact' },
          )
          .in('status', ['confirmed', 'completed'])
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ]);

    const today = todayInArgentina();
    const file = buildPatientWorkbook({
      today,
      patients: clients.map((client) => ({
        id: client.id,
        fullName: client.full_name ?? '',
        email: client.email,
        phone: client.phone,
        registeredOn: argentinaDate(client.created_at),
      })),
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        clientId: appointment.client_id,
        date: appointment.date,
        startTime: appointment.start_time,
        status: appointment.status,
        treatments: treatmentNames(appointment.treatments),
      })),
    });

    return new NextResponse(file, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${patientWorkbookFileName(today)}"`,
        // Patient data: never kept by the browser or any cache
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    // Only the reason goes to the logs, no patient data
    console.error(
      'Patient workbook export failed:',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: 'No se pudo generar el archivo. Intentá de nuevo.' },
      { status: 500 },
    );
  }
}
