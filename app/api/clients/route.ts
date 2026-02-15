import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/clients - List all client profiles (admin only)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('full_name', { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/clients - Create a manual client profile (admin only)
export async function POST(request: Request) {
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

  const body = await request.json();
  const { full_name, phone, email } = body;

  if (!full_name?.trim()) {
    return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      full_name: full_name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || '',
      role: 'client',
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
