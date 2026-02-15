import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Helper: create a redirect that preserves the refreshed session cookies.
  // Without this the browser and server go out of sync and the user gets
  // logged out on the very next request.
  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);
    // Copy refreshed auth cookies so the session stays alive
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // Protect /admin routes - require auth + admin role
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      return redirectTo('/auth/admin');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return redirectTo('/');
    }
  }

  // Protect /mis-turnos - require auth (any role)
  if (request.nextUrl.pathname.startsWith('/mis-turnos') && !user) {
    return redirectTo('/auth/login');
  }

  // If logged in user visits /auth/login, redirect home
  if (request.nextUrl.pathname.startsWith('/auth/login') && user) {
    return redirectTo('/');
  }

  // If logged in admin visits /auth/admin, redirect to admin
  if (request.nextUrl.pathname.startsWith('/auth/admin') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role === 'admin') {
      return redirectTo('/admin');
    }
  }

  return supabaseResponse;
}
