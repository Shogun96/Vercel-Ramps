import { hasSupabaseCredentials, supabase } from "@/lib/supabase"

export type RampMovementEvent =
  | "ramp_status_changed"
  | "ramp_input_changed"
  | "ramp_cleared"
  | "truck_trailer_changed"
  | "clear_all"

export interface RampMovement {
  id?: string
  created_at: string
  event_type: RampMovementEvent | string
  ramp_number: number | null
  previous_status: string | null
  new_status: string | null
  previous_truck: string | null
  new_truck: string | null
  previous_trailer: string | null
  new_trailer: string | null
  truck: string | null
  trailer: string | null
  changed_field: string | null
  source: string | null
  device_id: string | null
  notes: string | null
}

export type NewRampMovement = Omit<RampMovement, "id" | "created_at"> & {
  created_at?: string
}

const LOCAL_MOVEMENTS_KEY = "warehouseRampMovements"

const safeString = (value: unknown) => {
  if (typeof value !== "string") return value == null ? null : String(value)
  const clean = value.trim()
  return clean ? clean : null
}

const getDeviceId = () => {
  if (typeof window === "undefined") return null

  let deviceId = window.localStorage.getItem("warehouseSyncId")
  if (!deviceId) {
    deviceId = `device_${Math.random().toString(36).slice(2, 15)}`
    window.localStorage.setItem("warehouseSyncId", deviceId)
  }

  return deviceId
}

const normalizeMovement = (movement: NewRampMovement): RampMovement => ({
  created_at: movement.created_at || new Date().toISOString(),
  event_type: movement.event_type,
  ramp_number: movement.ramp_number ?? null,
  previous_status: safeString(movement.previous_status),
  new_status: safeString(movement.new_status),
  previous_truck: safeString(movement.previous_truck),
  new_truck: safeString(movement.new_truck),
  previous_trailer: safeString(movement.previous_trailer),
  new_trailer: safeString(movement.new_trailer),
  truck: safeString(movement.truck),
  trailer: safeString(movement.trailer),
  changed_field: safeString(movement.changed_field),
  source: safeString(movement.source),
  device_id: safeString(movement.device_id) || getDeviceId(),
  notes: safeString(movement.notes),
})

const getLocalMovements = (): RampMovement[] => {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(LOCAL_MOVEMENTS_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error("Failed to read local ramp movements:", error)
    return []
  }
}

const saveLocalMovement = (movement: RampMovement) => {
  if (typeof window === "undefined") return

  try {
    const existing = getLocalMovements()
    const next = [movement, ...existing].slice(0, 5000)
    window.localStorage.setItem(LOCAL_MOVEMENTS_KEY, JSON.stringify(next))
  } catch (error) {
    console.error("Failed to save local ramp movement:", error)
  }
}

export async function recordRampMovement(movement: NewRampMovement) {
  const row = normalizeMovement(movement)

  saveLocalMovement(row)

  if (!hasSupabaseCredentials || !supabase) {
    return row
  }

  try {
    const { error } = await supabase.from("ramp_movements").insert({
      created_at: row.created_at,
      event_type: row.event_type,
      ramp_number: row.ramp_number,
      previous_status: row.previous_status,
      new_status: row.new_status,
      previous_truck: row.previous_truck,
      new_truck: row.new_truck,
      previous_trailer: row.previous_trailer,
      new_trailer: row.new_trailer,
      truck: row.truck,
      trailer: row.trailer,
      changed_field: row.changed_field,
      source: row.source,
      device_id: row.device_id,
      notes: row.notes,
    })

    if (error) {
      console.warn("Ramp movement was saved locally, but Supabase insert failed:", error.message)
    }
  } catch (error) {
    console.warn("Ramp movement was saved locally, but Supabase insert failed:", error)
  }

  return row
}

export async function fetchRampMovements(fromIso: string, toIso: string): Promise<RampMovement[]> {
  const fromTime = new Date(fromIso).getTime()
  const toTime = new Date(toIso).getTime()

  const localRows = getLocalMovements().filter((row) => {
    const time = new Date(row.created_at).getTime()
    return Number.isFinite(time) && time >= fromTime && time <= toTime
  })

  if (!hasSupabaseCredentials || !supabase) {
    return localRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  try {
    const { data, error } = await supabase
      .from("ramp_movements")
      .select("*")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })

    if (error) {
      console.warn("Could not fetch Supabase ramp movements, using local movements:", error.message)
      return localRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    const supabaseRows = (data || []) as RampMovement[]

    if (supabaseRows.length > 0) {
      return supabaseRows
    }

    return localRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  } catch (error) {
    console.warn("Could not fetch Supabase ramp movements, using local movements:", error)
    return localRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
}
