import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/clients - List all client profiles (admin only)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("full_name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
