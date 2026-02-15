'use client';

import { useMemo, useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Search,
  Phone,
  Mail,
  CalendarDays,
  Loader2,
  Plus,
  UserPlus,
  Pencil,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin-layout';
import {
  useClients,
  useAppointments,
  useTreatments,
  useAvailableSlots,
} from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

export default function ClientesPage() {
  const {
    clients,
    loading: clientsLoading,
    addClient,
    updateClient,
  } = useClients();
  const {
    appointments,
    loading: appointmentsLoading,
    createAppointment,
  } = useAppointments();
  const { activeTreatments } = useTreatments();
  const [search, setSearch] = useState('');

  // Add client dialog
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [addingClient, setAddingClient] = useState(false);

  // Edit client dialog
  const [showEditClient, setShowEditClient] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  // New appointment dialog
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [apptClientId, setApptClientId] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptTreatments, setApptTreatments] = useState<string[]>([]);
  const [creatingAppt, setCreatingAppt] = useState(false);

  const { slots: availableSlots, loading: slotsLoading } = useAvailableSlots(
    apptDate || null,
  );

  const loading = clientsLoading || appointmentsLoading;

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase();
    return clients
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)),
      )
      .map((c) => ({
        ...c,
        appointmentCount: appointments.filter((a) => a.client_id === c.id)
          .length,
        lastAppointment: appointments
          .filter((a) => a.client_id === c.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
      }));
  }, [clients, appointments, search]);

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    setAddingClient(true);
    try {
      await addClient({
        full_name: newClientName.trim(),
        phone: newClientPhone.trim() || undefined,
        email: newClientEmail.trim() || undefined,
      });
      setNewClientName('');
      setNewClientPhone('');
      setNewClientEmail('');
      setShowAddClient(false);
    } catch {
      // could show toast
    } finally {
      setAddingClient(false);
    }
  };

  const openEditClient = (client: {
    id: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
  }) => {
    setEditClientId(client.id);
    setEditClientName(client.full_name);
    setEditClientPhone(client.phone ?? '');
    setEditClientEmail(client.email ?? '');
    setShowEditClient(true);
  };

  const handleEditClient = async () => {
    if (!editClientName.trim()) return;
    setSavingClient(true);
    try {
      await updateClient(editClientId, {
        full_name: editClientName.trim(),
        phone: editClientPhone.trim() || undefined,
        email: editClientEmail.trim() || undefined,
      });
      setShowEditClient(false);
    } catch {
      // could show toast
    } finally {
      setSavingClient(false);
    }
  };

  const handleCreateAppt = async () => {
    if (!apptClientId || !apptDate || !apptTime || apptTreatments.length === 0)
      return;
    setCreatingAppt(true);
    try {
      const [h, m] = apptTime.split(':').map(Number);
      const endH = h + 1;
      const endTime = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      await createAppointment({
        client_id: apptClientId,
        date: apptDate,
        start_time: apptTime,
        end_time: endTime,
        treatment_ids: apptTreatments,
      });
      resetApptDialog();
    } catch {
      // could show toast
    } finally {
      setCreatingAppt(false);
    }
  };

  const resetApptDialog = () => {
    setApptClientId('');
    setApptDate('');
    setApptTime('');
    setApptTreatments([]);
    setShowNewAppt(false);
  };

  const toggleApptTreatment = (id: string) => {
    setApptTreatments((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  // Open new appointment with pre-selected client
  const openNewApptForClient = (clientId: string) => {
    setApptClientId(clientId);
    setShowNewAppt(true);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {clients.length} cliente{clients.length !== 1 ? 's' : ''} registrado
            {clients.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-56 rounded-lg border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setShowNewAppt(true)}
            >
              <CalendarDays className="h-4 w-4" />
              Nuevo turno
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowAddClient(true)}
            >
              <UserPlus className="h-4 w-4" />
              Agregar cliente
            </Button>
          </div>
        </div>

        {/* Client cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredClients.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-sm font-semibold text-primary">
                      {c.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {c.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Desde{' '}
                      {format(parseISO(c.created_at), 'MMM yyyy', {
                        locale: es,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => openEditClient(c)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="sr-only">Editar</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => openNewApptForClient(c.id)}
                  >
                    <Plus className="h-3 w-3" />
                    Turno
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{c.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>
                    {c.appointmentCount} turno
                    {c.appointmentCount !== 1 ? 's' : ''}
                    {c.lastAppointment && (
                      <>
                        {' - ultimo: '}
                        {format(parseISO(c.lastAppointment), 'd MMM', {
                          locale: es,
                        })}
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search
                ? 'No se encontraron clientes con esa busqueda.'
                : 'No hay clientes registrados.'}
            </p>
          </div>
        )}
      </div>

      {/* Add client dialog */}
      <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar cliente</DialogTitle>
            <DialogDescription>
              Crea un perfil para un cliente que no se registro por la web.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Nombre completo *</Label>
              <Input
                id="client-name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Ej: Maria Lopez"
                onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Telefono</Label>
              <Input
                id="client-phone"
                type="tel"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                placeholder="Ej: 11 2345-6789"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                placeholder="Ej: maria@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddClient}
              disabled={!newClientName.trim() || addingClient}
            >
              {addingClient && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit client dialog */}
      <Dialog open={showEditClient} onOpenChange={setShowEditClient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>
              Modifica los datos del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-client-name">Nombre completo *</Label>
              <Input
                id="edit-client-name"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditClient()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-client-phone">Telefono</Label>
              <Input
                id="edit-client-phone"
                type="tel"
                value={editClientPhone}
                onChange={(e) => setEditClientPhone(e.target.value)}
                placeholder="Ej: 11 2345-6789"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-client-email">Email</Label>
              <Input
                id="edit-client-email"
                type="email"
                value={editClientEmail}
                onChange={(e) => setEditClientEmail(e.target.value)}
                placeholder="Ej: maria@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleEditClient}
              disabled={!editClientName.trim() || savingClient}
            >
              {savingClient && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New appointment dialog */}
      <Dialog
        open={showNewAppt}
        onOpenChange={(open) => {
          if (!open) resetApptDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo turno</DialogTitle>
            <DialogDescription>
              Crea un turno manualmente para un cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Client select */}
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <select
                value={apptClientId}
                onChange={(e) => setApptClientId(e.target.value)}
                className="w-full appearance-none rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.phone ? ` (${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <Input
                type="date"
                value={apptDate}
                onChange={(e) => {
                  setApptDate(e.target.value);
                  setApptTime('');
                }}
              />
            </div>

            {/* Time slot */}
            {apptDate && (
              <div className="space-y-1.5">
                <Label>Horario *</Label>
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="rounded-lg border bg-muted/30 px-3 py-3 text-center text-sm text-muted-foreground">
                    No hay horarios disponibles en esta fecha.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setApptTime(slot)}
                        className={cn(
                          'rounded-lg border px-2 py-2 font-mono text-sm font-medium transition-colors',
                          apptTime === slot
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                        )}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Treatments */}
            <div className="space-y-1.5">
              <Label>Tratamiento(s) *</Label>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {activeTreatments.map((t) => (
                  <label
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                      apptTreatments.includes(t.id)
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      checked={apptTreatments.includes(t.id)}
                      onCheckedChange={() => toggleApptTreatment(t.id)}
                    />
                    <span className="font-medium text-foreground">
                      {t.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreateAppt}
              disabled={
                !apptClientId ||
                !apptDate ||
                !apptTime ||
                apptTreatments.length === 0 ||
                creatingAppt
              }
            >
              {creatingAppt && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
