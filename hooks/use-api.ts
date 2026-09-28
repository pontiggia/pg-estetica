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
  // The result remembers which URL it belongs to, so data for a previous URL
  // (e.g. the slots of the previously selected date) is never shown as current.
  const [result, setResult] = useState<{
    url: string;
    data: T | null;
    error: string | null;
  } | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refetch = useCallback(async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;
    try {
      const res = await fetch(currentUrl, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      // Ignore responses that arrive after the URL has changed
      if (urlRef.current !== currentUrl) return;
      setResult({ url: currentUrl, data: json, error: null });
    } catch (err) {
      if (urlRef.current !== currentUrl) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Keep the last good data for this URL (refetch after a mutation)
      setResult((prev) => ({
        url: currentUrl,
        data: prev?.url === currentUrl ? prev.data : null,
        error: message,
      }));
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [url, refetch]);

  const current = result?.url === url ? result : null;
  return {
    data: current?.data ?? null,
    // Only the first load of each URL shows a spinner; refetches keep the data
    loading: url !== null && current === null,
    error: current?.error ?? null,
    refetch,
  };
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
    const res = await fetch(`/api/slots/check?date=${date}`, {
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.available;
  } catch {
    return false;
  }
}

// Batch check: returns a map of date → has a free slot, for many dates in one
// call. Throws if availability could not be checked, so callers can tell
// "no free slots" apart from "could not load".
export async function checkDatesAvailabilityBatch(
  dates: string[],
): Promise<Record<string, boolean>> {
  if (dates.length === 0) return {};
  const res = await fetch('/api/slots/check-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ dates }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
