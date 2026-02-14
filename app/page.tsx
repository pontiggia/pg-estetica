'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { ClientLayout } from '@/components/client-layout';
import { BookingWizard } from '@/components/booking/booking-wizard';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function HomePage() {
  const [showWizard, setShowWizard] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data.user);
    });
  }, []);

  const handleReservar = () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    setShowWizard(true);
  };

  return (
    <ClientLayout>
      {!showWizard ? (
        <>
          {/* Hero section */}
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent" />

            <div className="relative mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl items-center justify-center px-4">
              <div className="flex flex-col items-center text-center">
                <h1 className="mb-4 font-serif text-3xl leading-tight text-foreground sm:text-4xl lg:text-[2.75rem] text-balance">
                  Tu espacio de cuidado
                  <br />
                  <span className="text-primary">y bienestar</span>
                </h1>

                <p className="mb-10 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                  Reserva tu proximo tratamiento de forma rapida y sencilla.
                  Elegis el dia, el horario y listo.
                </p>

                <Button
                  size="lg"
                  onClick={handleReservar}
                  className="group gap-2.5 rounded-full bg-primary px-7 text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                >
                  <CalendarDays className="h-4.5 w-4.5" />
                  Reservar turno
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Button>

                <p className="mt-12 text-sm text-muted-foreground">
                  {'Ya tenes turno? '}
                  <Link
                    href="/mis-turnos"
                    className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 decoration-primary/30 hover:decoration-primary/60 transition-colors"
                  >
                    Ver mis turnos
                  </Link>
                </p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="mx-auto max-w-lg px-4 py-8">
          <button
            onClick={() => setShowWizard(false)}
            className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            Volver al inicio
          </button>
          <BookingWizard onComplete={() => router.push('/mis-turnos')} />
        </div>
      )}
    </ClientLayout>
  );
}
