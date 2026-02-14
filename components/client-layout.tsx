'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, ClipboardList, LogOut, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/', label: 'Reservar', icon: CalendarDays },
  { href: '/mis-turnos', label: 'Mis Turnos', icon: ClipboardList },
];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setChecking(false);
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 group">
            <span className="font-serif text-xl sm:text-2xl tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">
              Paula Guerendiain
            </span>
          </Link>

          <nav className="flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
            {!checking &&
              (user ? (
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-200"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              ) : (
                <Link
                  href="/auth/login"
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-200"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ingresar</span>
                </Link>
              ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto max-w-3xl px-4 flex flex-col items-center gap-2">
          <span className="font-serif text-sm text-foreground/60">
            Paula Guerendiain
          </span>
          <span className="text-xs text-muted-foreground/60">
            Estetica Integral
          </span>
        </div>
      </footer>
    </div>
  );
}
