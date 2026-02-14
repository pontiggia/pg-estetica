import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handle the OAuth callback from Supabase (Google sign-in)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Successful login — redirect to intended page
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If something went wrong, redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
