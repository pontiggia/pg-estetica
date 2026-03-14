'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Treatment,
  Appointment,
  Availability,
  AvailabilityOverride,
  Profile,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Generic fetcher with auto-refresh
// ---------------------------------------------------------------------------

function useApiFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const initialised = useRef(false);

  const refetch = useCallback(async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) {
      setData(null);
      setLoading(false);
      return;
    }
    // Only show full loading spinner on first load
    if (!initialised.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch(currentUrl);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      initialised.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [url, refetch]);

  return { data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// Treatments
// ---------------------------------------------------------------------------

export function useTreatments() {
  const { data, loading, error, refetch } =
    useApiFetch<Treatment[]>('/api/treatments');

  const addTreatment = useCallback(
    async (name: string) => {
      const res = await fetch('/api/treatments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to create treatment');
      await refetch();
    },
    [refetch],
  );

  const updateTreatment = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Treatment, 'name' | 'is_active'>>,
    ) => {
      const res = await fetch(`/api/treatments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update treatment');
      await refetch();
    },
    [refetch],
  );

  const deleteTreatment = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/treatments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete treatment');
      await refetch();
    },
    [refetch],
  );

  return {
    treatments: (data ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
    activeTreatments: (data ?? [])
      .filter((t) => t.is_active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    loading,
    error,
    refetch,
    addTreatment,
    updateTreatment,
    deleteTreatment,
  };
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export function useAppointments(params?: {
  client_id?: string;
  date?: string;
  status?: string;
}) {
  const search = new URLSearchParams();
  if (params?.client_id) search.set('client_id', params.client_id);
  if (params?.date) search.set('date', params.date);
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  const url = `/api/appointments${qs ? `?${qs}` : ''}`;

  const { data, loading, error, refetch } = useApiFetch<Appointment[]>(url);

  const createAppointment = useCallback(
    async (body: {
      client_id: string;
      date: string;
      start_time: string;
      end_time: string;
      treatment_ids: string[];
      notes?: string;
    }) => {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create appointment');
      }
      await refetch();
      return res.json();
    },
    [refetch],
  );

  const updateAppointmentStatus = useCallback(
    async (id: string, status: string, notes?: string) => {
      const body: Record<string, string> = { status };
      if (notes) body.notes = notes;
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update appointment');
      await refetch();
    },
    [refetch],
  );

  const deleteAppointment = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete appointment');
      await refetch();
    },
    [refetch],
  );

  return {
    appointments: data ?? [],
    loading,
    error,
    refetch,
    createAppointment,
    updateAppointmentStatus,
    deleteAppointment,
  };
}

// ---------------------------------------------------------------------------
// Availability (weekly schedule)
// ---------------------------------------------------------------------------

export function useAvailability() {
  const { data, loading, error, refetch } =
    useApiFetch<Availability[]>('/api/availability');

  const updateAvailability = useCallback(
    async (
      id: string,
      updates: Partial<
        Pick<Availability, 'is_active' | 'start_time' | 'end_time'>
      >,
    ) => {
      const res = await fetch(`/api/availability/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update availability');
      await refetch();
    },
    [refetch],
  );

  return {
    availability: data ?? [],
    loading,
    error,
    refetch,
    updateAvailability,
  };
}

// ---------------------------------------------------------------------------
// Overrides (availability exceptions)
// ---------------------------------------------------------------------------

export function useOverrides() {
  const { data, loading, error, refetch } =
    useApiFetch<AvailabilityOverride[]>('/api/overrides');

  const addOverride = useCallback(
    async (body: {
      date: string;
      start_time: string | null;
      end_time: string | null;
      is_blocked: boolean;
      reason: string | null;
      blocked_slots: string[];
    }) => {
      const res = await fetch('/api/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create override');
      await refetch();
    },
    [refetch],
  );

  const deleteOverride = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/overrides/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete override');
      await refetch();
    },
    [refetch],
  );

  return {
    overrides: data ?? [],
    loading,
    error,
    refetch,
    addOverride,
    deleteOverride,
  };
}

// ---------------------------------------------------------------------------
// Clients (admin)
// ---------------------------------------------------------------------------

export function useClients() {
  const { data, loading, error, refetch } =
    useApiFetch<Profile[]>('/api/clients');

  const addClient = useCallback(
    async (body: { full_name: string; phone?: string; email?: string }) => {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create client');
      }
      await refetch();
      return res.json();
    },
    [refetch],
  );

  const updateClient = useCallback(
    async (
      id: string,
      updates: { full_name?: string; phone?: string; email?: string },
    ) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update client');
      }
      await refetch();
    },
    [refetch],
  );

  return {
    clients: data ?? [],
    loading,
    error,
    refetch,
    addClient,
    updateClient,
  };
}

// ---------------------------------------------------------------------------
// Current user profile
// ---------------------------------------------------------------------------

export function useProfile() {
  const { data, loading, error, refetch } =
    useApiFetch<Profile>('/api/profile');
  return { profile: data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// Available slots for a specific date
// ---------------------------------------------------------------------------

export function useAvailableSlots(date: string | null, includeExtra = false) {
  const url = date ? `/api/slots?date=${date}${includeExtra ? '&include_extra=true' : ''}` : null;
  const { data, loading, error, refetch } = useApiFetch<{
    slots: string[];
    available: boolean;
  }>(url);
  return {
    slots: data?.slots ?? [],
    available: data?.available ?? false,
    loading,
    error,
    refetch,
  };
}

// ---------------------------------------------------------------------------
// Quick date availability check
// ---------------------------------------------------------------------------

export async function checkDateAvailability(date: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/slots/check?date=${date}`);
    if (!res.ok) return false;
    const json = await res.json();
    return json.available;
  } catch {
    return false;
  }
}

// Batch check: returns a map of date → available for many dates in one call
export async function checkDatesAvailabilityBatch(
  dates: string[],
): Promise<Record<string, boolean>> {
  if (dates.length === 0) return {};
  try {
    const res = await fetch('/api/slots/check-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dates }),
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
