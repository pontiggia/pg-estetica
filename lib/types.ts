export type Role = "client" | "admin"

export type AppointmentStatus = "confirmed" | "cancelled" | "completed"

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  role: Role
  created_at: string
  updated_at: string
}

export interface Treatment {
  id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: string
  client_id: string
  date: string
  start_time: string
  end_time: string
  status: AppointmentStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  client?: Profile
  treatments?: Treatment[]
}

export interface AppointmentTreatment {
  id: string
  appointment_id: string
  treatment_id: string
}

export interface Availability {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
}

export interface AvailabilityOverride {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  is_blocked: boolean
  reason: string | null
  blocked_slots: string[]
  created_at: string
}

export interface TimeSlot {
  time: string
  available: boolean
}
