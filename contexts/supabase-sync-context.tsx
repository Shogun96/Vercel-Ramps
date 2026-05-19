"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { supabase, hasSupabaseCredentials } from "@/lib/supabase"
import type { RampStatus } from "@/components/warehouse-visualization"

interface SupabaseSyncContextType {
  syncId: string
  setSyncId: (id: string) => void
  isSyncing: boolean
  syncError: string | null
  lastSynced: Date | null
  syncLookupData: (data: any[]) => Promise<void>
  syncRampStatus: (status: Record<number, RampStatus>) => Promise<void>
  isSupabaseAvailable: boolean
  isInitializing: boolean
  connectionStatus: "connected" | "disconnected" | "connecting"
}

const defaultContextValue: SupabaseSyncContextType = {
  syncId: "",
  setSyncId: () => {},
  isSyncing: false,
  syncError: null,
  lastSynced: null,
  syncLookupData: async () => {},
  syncRampStatus: async () => {},
  isSupabaseAvailable: false,
  isInitializing: false,
  connectionStatus: "connecting",
}

const SupabaseSyncContext = createContext<SupabaseSyncContextType>(defaultContextValue)

export function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const isInitialized = useRef(false)
  const connectionRetries = useRef<number>(0)
  const maxConnectionRetries = 1
  const channelsRef = useRef<{
    lookupChannel: ReturnType<typeof supabase.channel> | null
    rampStatusChannel: ReturnType<typeof supabase.channel> | null
  }>({
    lookupChannel: null,
    rampStatusChannel: null,
  })

  const [syncId, setSyncId] = useState<string>("")
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [isSupabaseAvailable, setIsSupabaseAvailable] = useState<boolean>(false)
  const [isInitializing, setIsInitializing] = useState<boolean>(false)
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting")

  const supabaseConfigured = hasSupabaseCredentials && supabase !== null

  // Cleanup function for channels (only lookup channel now)
  const cleanupChannels = useCallback(() => {
    if (!supabase) return
    try {
      if (channelsRef.current.lookupChannel) {
        supabase.removeChannel(channelsRef.current.lookupChannel)
        channelsRef.current.lookupChannel = null
      }

      if (channelsRef.current.rampStatusChannel) {
        supabase.removeChannel(channelsRef.current.rampStatusChannel)
        channelsRef.current.rampStatusChannel = null
      }
    } catch (error) {
      console.error("Error cleaning up channels:", error)
    }
  }, [])

  const testSupabaseConnection = useCallback(
    async (retryAttempt = 0): Promise<boolean> => {
      // If Supabase is not configured, skip connection test
      if (!supabaseConfigured || !supabase) {
        console.log("Supabase not configured, using local storage only")
        return false
      }

      try {
        console.log(`Testing Supabase connection (attempt ${retryAttempt + 1}/${maxConnectionRetries + 1})...`)

        // Use a simple query with timeout
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 1800),
        )

        const queryPromise = supabase.from("lookup_data").select("count", { count: "exact", head: true })

        const result = await Promise.race([queryPromise, timeoutPromise])

        if (result && typeof result === "object" && "error" in result && result.error) {
          throw result.error
        }

        console.log("Supabase connection test successful")
        return true
      } catch (error: any) {
        console.error(`Connection test failed (attempt ${retryAttempt + 1}):`, error?.message || error)

        if (retryAttempt < maxConnectionRetries) {
          const delay = 500
          console.log(`Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          return testSupabaseConnection(retryAttempt + 1)
        }

        return false
      }
    },
    [supabaseConfigured],
  )

  const mapStatusRowToRampStatus = useCallback((row: any): RampStatus => {
    return {
      active: Boolean(row.active),
      red: Boolean(row.red),
      yellow: Boolean(row.yellow),
      inputValue: row.input_value || "",
      truckValue: row.truck_value || "",
      trailerValue: row.trailer_value || "",
      hasTruck: Boolean(row.has_truck),
      isExiting: Boolean(row.is_exiting),
    }
  }, [])

  const fetchRampStatusFromSupabase = useCallback(async () => {
    if (!supabase) return

    try {
      const { data, error } = await supabase.from("warehouse_status").select("*")

      if (error) {
        console.warn("Could not load warehouse_status from Supabase:", error.message)
        return
      }

      const status: Record<number, RampStatus> = {}

      ;(data || []).forEach((row: any) => {
        const rampNumber = Number(row.ramp_number)
        if (Number.isFinite(rampNumber)) {
          status[rampNumber] = mapStatusRowToRampStatus(row)
        }
      })

      window.dispatchEvent(
        new CustomEvent("rampStatusRemoteUpdated", {
          detail: { status, timestamp: new Date(), source: "supabase_initial_load" },
        }),
      )
    } catch (error) {
      console.warn("Could not load warehouse_status from Supabase:", error)
    }
  }, [mapStatusRowToRampStatus])

  // Set up real-time subscriptions for lookup data and warehouse status
  const setupRealtimeSubscriptions = useCallback(() => {
    if (!supabase) return

    cleanupChannels()

    try {
      const lookupChannelName = `lookup_data_${Date.now()}`

      channelsRef.current.lookupChannel = supabase
        .channel(lookupChannelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "lookup_data" }, (payload) => {
          window.dispatchEvent(
            new CustomEvent("lookupDataUpdated", {
              detail: { payload, timestamp: new Date() },
            }),
          )
        })
        .subscribe((status, err) => {
          if (err) {
            console.error("Channel error:", err)
            setConnectionStatus("disconnected")
            setSyncError(`Channel error: ${err.message}`)
            return
          }
          if (status === "SUBSCRIBED") {
            setConnectionStatus("connected")
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionStatus("disconnected")
          }
        })

      const rampStatusChannelName = `warehouse_status_${Date.now()}`

      channelsRef.current.rampStatusChannel = supabase
        .channel(rampStatusChannelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_status" }, (payload) => {
          const row: any = payload.new || payload.old
          const rampNumber = Number(row?.ramp_number)

          if (Number.isFinite(rampNumber) && payload.eventType !== "DELETE") {
            window.dispatchEvent(
              new CustomEvent("rampStatusRemoteUpdated", {
                detail: {
                  status: {
                    [rampNumber]: mapStatusRowToRampStatus(row),
                  },
                  payload,
                  timestamp: new Date(),
                  source: "supabase_realtime",
                },
              }),
            )
          } else {
            fetchRampStatusFromSupabase()
          }
        })
        .subscribe((status, err) => {
          if (err) {
            console.error("Warehouse status channel error:", err)
            setConnectionStatus("disconnected")
            setSyncError(`Warehouse status channel error: ${err.message}`)
            return
          }

          if (status === "SUBSCRIBED") {
            setConnectionStatus("connected")
            fetchRampStatusFromSupabase()
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionStatus("disconnected")
          }
        })
    } catch (error: any) {
      console.error("Error setting up subscriptions:", error)
      setSyncError(`Failed to set up real-time subscriptions: ${error?.message}`)
      setConnectionStatus("disconnected")
    }
  }, [cleanupChannels, fetchRampStatusFromSupabase, mapStatusRowToRampStatus])

  // Initialize Supabase connection
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    const initializeSupabase = async () => {
      // Get or create sync ID first (always works)
      const savedSyncId = localStorage.getItem("warehouseSyncId")
      if (savedSyncId) {
        setSyncId(savedSyncId)
      } else {
        const newSyncId = `device_${Math.random().toString(36).substring(2, 15)}`
        localStorage.setItem("warehouseSyncId", newSyncId)
        setSyncId(newSyncId)
      }

      setIsInitializing(false)

      if (!supabaseConfigured) {
        console.log("Supabase credentials not found, running in local-only mode")
        setIsSupabaseAvailable(false)
        setConnectionStatus("disconnected")
        setSyncError(null) // Not an error, just local mode
        setIsInitializing(false)
        return
      }

      try {
        setConnectionStatus("connecting")

        const isConnected = await testSupabaseConnection()

        if (isConnected) {
          setIsSupabaseAvailable(true)
          setConnectionStatus("connected")
          setSyncError(null)
          connectionRetries.current = 0
          setupRealtimeSubscriptions()
        } else {
          // Fall back to local storage mode without showing error
          setIsSupabaseAvailable(false)
          setConnectionStatus("disconnected")
          console.log("Using local storage mode (Supabase unavailable)")
        }
      } catch (error: any) {
        console.error("Failed to initialize Supabase:", error)
        setIsSupabaseAvailable(false)
        setConnectionStatus("disconnected")
      }

      setIsInitializing(false)
    }

    initializeSupabase()

    return () => {
      cleanupChannels()
    }
  }, [setupRealtimeSubscriptions, cleanupChannels, testSupabaseConnection, supabaseConfigured])

  // Sync lookup data to Supabase (HTML DB ONLY)
  const syncLookupData = useCallback(
    async (data: any[]) => {
      // Always save to localStorage first
      localStorage.setItem("truckTrailerLookup", JSON.stringify(data))
      localStorage.setItem("lookupLastUpdated", new Date().toISOString())

      if (!isSupabaseAvailable || connectionStatus !== "connected" || !supabase) {
        console.log("Saved to localStorage (Supabase not available)")
        return
      }

      setIsSyncing(true)
      setSyncError(null)

      try {
        // Delete existing data
        const { error: deleteError } = await supabase
          .from("lookup_data")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000")

        if (deleteError) {
          console.warn("Could not clear existing data:", deleteError.message)
        }

        // Insert new data
        const lookupRows = data.map((item, index) => ({
          truck: item.truck || "",
          trailer: item.trailer || "",
          row_number: item.row || index + 1,
        }))

        if (lookupRows.length > 0) {
          const batchSize = 50
          for (let i = 0; i < lookupRows.length; i += batchSize) {
            const batch = lookupRows.slice(i, i + batchSize)
            const { error } = await supabase.from("lookup_data").insert(batch)

            if (error) {
              throw error
            }
          }
        }

        const now = new Date()
        setLastSynced(now)
        console.log(`Synced ${data.length} entries to Supabase`)
      } catch (error: any) {
        console.error("Error syncing data:", error)
        setSyncError(`Sync failed: ${error?.message}`)
      } finally {
        setIsSyncing(false)
      }
    },
    [isSupabaseAvailable, connectionStatus],
  )

  // Sync ramp status locally and to Supabase for real-time multi-device updates
  const syncRampStatus = useCallback(
    async (status: Record<number, RampStatus>) => {
      try {
        localStorage.setItem("warehouseRampStatus_localOnly", JSON.stringify(status))
        localStorage.setItem("rampStatusLastUpdated_localOnly", new Date().toISOString())
      } catch (error) {
        console.error("Error saving ramp status locally:", error)
      }

      if (!isSupabaseAvailable || connectionStatus !== "connected" || !supabase) {
        return
      }

      try {
        const rows = Object.entries(status).map(([rampNumber, rampStatus]) => ({
          ramp_number: Number(rampNumber),
          active: Boolean(rampStatus.active),
          red: Boolean(rampStatus.red),
          yellow: Boolean(rampStatus.yellow),
          input_value: rampStatus.inputValue || "",
          truck_value: rampStatus.truckValue || "",
          trailer_value: rampStatus.trailerValue || "",
          has_truck: Boolean(rampStatus.hasTruck),
          is_exiting: Boolean(rampStatus.isExiting),
          updated_at: new Date().toISOString(),
        }))

        if (rows.length > 0) {
          const { error } = await supabase.from("warehouse_status").upsert(rows, {
            onConflict: "ramp_number",
          })

          if (error) {
            console.warn("Ramp status was saved locally, but Supabase sync failed:", error.message)
          }
        }
      } catch (error) {
        console.warn("Ramp status was saved locally, but Supabase sync failed:", error)
      }
    },
    [connectionStatus, isSupabaseAvailable],
  )

  return (
    <SupabaseSyncContext.Provider
      value={{
        syncId,
        setSyncId,
        isSyncing,
        syncError,
        lastSynced,
        syncLookupData,
        syncRampStatus,
        isSupabaseAvailable,
        isInitializing,
        connectionStatus,
      }}
    >
      {children}
    </SupabaseSyncContext.Provider>
  )
}

export function useSupabaseSync() {
  const context = useContext(SupabaseSyncContext)
  if (!context) {
    throw new Error("useSupabaseSync must be used within a SupabaseSyncProvider")
  }
  return context
}
