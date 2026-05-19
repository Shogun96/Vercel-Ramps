"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import WarehouseLayout from "./warehouse-layout"
import Legend from "./legend"
import HtmlUploader from "./html-uploader"
import { useSupabaseSync } from "@/contexts/supabase-sync-context"

export interface RampStatus {
  active: boolean
  red: boolean
  yellow: boolean
  inputValue: string
  truckValue: string
  trailerValue: string
  hasTruck: boolean
  isExiting?: boolean
}

type RampState = "occupied" | "free" | "defect"
type RampFilter = "all" | RampState

const RAMP_NUMBERS = Array.from({ length: 41 }, (_, index) => index + 20)
const LEFT_RAMPS = Array.from({ length: 17 }, (_, index) => 60 - index)
const RIGHT_RAMPS = Array.from({ length: 16 }, (_, index) => 20 + index)
const BOTTOM_RAMPS = Array.from({ length: 8 }, (_, index) => 43 - index)

const createDefaultStatus = (): RampStatus => ({
  active: false,
  red: false,
  yellow: false,
  inputValue: "",
  truckValue: "",
  trailerValue: "",
  hasTruck: false,
  isExiting: false,
})

const initializeRampStatus = () => {
  const status: Record<number, RampStatus> = {}
  RAMP_NUMBERS.forEach((rampNumber) => {
    status[rampNumber] = createDefaultStatus()
  })
  return status
}

const getRampState = (status?: RampStatus): RampState => {
  if (!status) return "free"
  if (status.yellow) return "defect"
  if (status.active || status.red || status.truckValue || status.trailerValue) return "occupied"
  return "free"
}

const getRampStateLabel = (status?: RampStatus) => {
  const state = getRampState(status)
  if (state === "occupied") return "Occupied"
  if (state === "defect") return "Defect"
  return "Free"
}

function WarehouseVisualizationContent() {
  const isMounted = useRef(false)
  const initialLoadDone = useRef(false)

  const { syncRampStatus, isInitializing, isSupabaseAvailable, connectionStatus } = useSupabaseSync()

  const [rampStatus, setRampStatus] = useState<Record<number, RampStatus>>(initializeRampStatus())
  const [selectedRamp, setSelectedRamp] = useState<number | null>(null)
  const [rampSearch, setRampSearch] = useState("")
  const [filter, setFilter] = useState<RampFilter>("all")
  const [showUploader, setShowUploader] = useState(false)
  const [lastLocalSave, setLastLocalSave] = useState<Date | null>(null)

  const saveRampStatus = useCallback(
    (status: Record<number, RampStatus>) => {
      if (typeof window === "undefined") return

      try {
        syncRampStatus(status).catch((error) => {
          console.error("Error saving ramp status locally:", error)
        })
        setLastLocalSave(new Date())
      } catch (error) {
        console.error("Failed to save ramp status", error)
      }
    },
    [syncRampStatus],
  )

  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true

    if (typeof window === "undefined") return

    try {
      const savedStatus = localStorage.getItem("warehouseRampStatus_localOnly")
      if (savedStatus) {
        const parsedStatus = JSON.parse(savedStatus)
        const validatedStatus = initializeRampStatus()

        RAMP_NUMBERS.forEach((rampNumber) => {
          validatedStatus[rampNumber] = parsedStatus[rampNumber]
            ? { ...createDefaultStatus(), ...parsedStatus[rampNumber] }
            : createDefaultStatus()
        })

        setRampStatus(validatedStatus)

        const savedTimestamp = localStorage.getItem("rampStatusLastUpdated_localOnly")
        if (savedTimestamp) setLastLocalSave(new Date(savedTimestamp))
      }
    } catch (error) {
      console.error("Failed to load ramp status from localStorage", error)
      setRampStatus(initializeRampStatus())
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const dashboardStats = useMemo(() => {
    const total = RAMP_NUMBERS.length
    let occupied = 0
    let defect = 0
    let free = 0

    RAMP_NUMBERS.forEach((rampNumber) => {
      const state = getRampState(rampStatus[rampNumber])
      if (state === "occupied") occupied += 1
      if (state === "defect") defect += 1
      if (state === "free") free += 1
    })

    return {
      total,
      occupied,
      defect,
      free,
      utilization: total ? Math.round((occupied / total) * 100) : 0,
    }
  }, [rampStatus])

  const isRampMatchingFocus = useCallback(
    (rampNumber: number) => {
      const status = rampStatus[rampNumber] || createDefaultStatus()
      const search = rampSearch.trim().toLowerCase()
      const state = getRampState(status)

      const matchesFilter = filter === "all" || filter === state
      const searchableText = `${rampNumber} ${status.truckValue || ""} ${status.trailerValue || ""}`.toLowerCase()
      const matchesSearch = search === "" || searchableText.includes(search)

      return matchesFilter && matchesSearch
    },
    [filter, rampSearch, rampStatus],
  )

  const visibleFocusCount = useMemo(() => {
    return RAMP_NUMBERS.filter((rampNumber) => isRampMatchingFocus(rampNumber)).length
  }, [isRampMatchingFocus])

  const toggleUploader = useCallback(() => {
    setShowUploader((previous) => !previous)
  }, [])

  const handleSelectRamp = useCallback((rampNumber: number) => {
    setSelectedRamp(rampNumber)
  }, [])

  const handleRampClick = useCallback(
    (rampNumber: number) => {
      if (!isMounted.current) return
      if (rampNumber < 20 || rampNumber > 60) return

      setSelectedRamp(rampNumber)

      setRampStatus((previous) => {
        const currentStatus = previous[rampNumber] || createDefaultStatus()
        const hasData =
          Boolean(currentStatus.truckValue?.trim()) ||
          Boolean(currentStatus.trailerValue?.trim()) ||
          currentStatus.yellow

        const nextStatus = {
          ...previous,
          [rampNumber]: hasData
            ? {
                ...currentStatus,
                active: !currentStatus.active,
                red: !currentStatus.yellow ? !currentStatus.active : false,
                hasTruck: !currentStatus.yellow ? !currentStatus.active : false,
              }
            : {
                ...currentStatus,
                active: !currentStatus.active,
                red: !currentStatus.active,
                yellow: false,
                hasTruck: !currentStatus.active,
              },
        }

        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [saveRampStatus],
  )

  const handleInputChange = useCallback(
    (rampNumber: number, value: string, inputType: "truck" | "trailer") => {
      if (!isMounted.current) return

      setSelectedRamp(rampNumber)

      setRampStatus((previous) => {
        const currentStatus = previous[rampNumber] || createDefaultStatus()
        const updatedStatus = {
          ...currentStatus,
          [inputType === "truck" ? "truckValue" : "trailerValue"]: value,
        }

        updatedStatus.inputValue = `${updatedStatus.truckValue || ""} ${updatedStatus.trailerValue || ""}`.trim()

        const lowerTruckValue = updatedStatus.truckValue?.trim().toLowerCase() || ""
        const lowerTrailerValue = updatedStatus.trailerValue?.trim().toLowerCase() || ""
        const isYellow = lowerTruckValue === "defect" || lowerTrailerValue === "defect"
        const hasAnyInput =
          (lowerTruckValue !== "" && lowerTruckValue !== "defect") ||
          (lowerTrailerValue !== "" && lowerTrailerValue !== "defect")

        const nextStatus = {
          ...previous,
          [rampNumber]: {
            ...updatedStatus,
            active: hasAnyInput || isYellow || currentStatus.active,
            red: hasAnyInput && !isYellow,
            yellow: isYellow,
            hasTruck: hasAnyInput && !isYellow,
            isExiting: false,
          },
        }

        if (!hasAnyInput && !isYellow && !currentStatus.active) {
          nextStatus[rampNumber] = {
            ...updatedStatus,
            active: false,
            red: false,
            yellow: false,
            hasTruck: false,
            isExiting: false,
          }
        }

        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [saveRampStatus],
  )

  const handleClearRamp = useCallback(
    (rampNumber: number) => {
      setRampStatus((previous) => {
        const nextStatus = {
          ...previous,
          [rampNumber]: createDefaultStatus(),
        }
        saveRampStatus(nextStatus)
        return nextStatus
      })
      if (selectedRamp === rampNumber) setSelectedRamp(null)
    },
    [saveRampStatus, selectedRamp],
  )

  const handleMarkDefect = useCallback(
    (rampNumber: number) => {
      setSelectedRamp(rampNumber)
      setRampStatus((previous) => {
        const nextStatus = {
          ...previous,
          [rampNumber]: {
            ...createDefaultStatus(),
            active: true,
            yellow: true,
            red: false,
            hasTruck: false,
            inputValue: "defect",
            truckValue: "defect",
          },
        }
        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [saveRampStatus],
  )

  const handleClearAll = useCallback(() => {
    const confirmed = window.confirm("Clear all ramp statuses and local truck/trailer values?")
    if (!confirmed) return

    const nextStatus = initializeRampStatus()
    setRampStatus(nextStatus)
    setSelectedRamp(null)
    setRampSearch("")
    saveRampStatus(nextStatus)
  }, [saveRampStatus])

  const handleExportCsv = useCallback(() => {
    const rows = [
      ["Ramp", "Status", "Truck", "Trailer"],
      ...RAMP_NUMBERS.map((rampNumber) => {
        const status = rampStatus[rampNumber] || createDefaultStatus()
        return [
          String(rampNumber),
          getRampStateLabel(status),
          status.truckValue || "",
          status.trailerValue || "",
        ]
      }),
    ]

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `warehouse-ramp-status-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [rampStatus])

  return (
    <div id="app" className="warehouse-board-app">
      <header className="warehouse-board-header">
        <div className="warehouse-board-title">
          <div className="warehouse-board-logo">WR</div>
          <div>
            <h1>Warehouse Ramp Status</h1>
            <p>Interactive ramp board shaped like the warehouse</p>
          </div>
        </div>

        <div className="warehouse-board-actions">
          <div
            className={`sync-pill ${
              isSupabaseAvailable && connectionStatus === "connected"
                ? "online"
                : connectionStatus === "connecting"
                  ? "connecting"
                  : "offline"
            }`}
          >
            <span />
            {isSupabaseAvailable && connectionStatus === "connected"
              ? "Lookup DB online"
              : connectionStatus === "connecting"
                ? "Starting fast..."
                : "Local mode"}
          </div>

          <button className="control-button ghost" onClick={toggleUploader}>
            {showUploader ? "Hide tools" : "Database tools"}
          </button>
          <button className="control-button ghost" onClick={handleExportCsv}>
            Export CSV
          </button>
          <button className="control-button danger" onClick={handleClearAll}>
            Clear all
          </button>
        </div>
      </header>

      {showUploader ? (
        <section className="database-tools-panel">
          <HtmlUploader />
        </section>
      ) : null}

      <section className="warehouse-kpi-grid">
        <div className="warehouse-kpi-card free">
          <span>Free ramps</span>
          <strong>{dashboardStats.free}</strong>
        </div>
        <div className="warehouse-kpi-card occupied">
          <span>Occupied</span>
          <strong>{dashboardStats.occupied}</strong>
        </div>
        <div className="warehouse-kpi-card defect">
          <span>Defect</span>
          <strong>{dashboardStats.defect}</strong>
        </div>
        <div className="warehouse-kpi-card neutral">
          <span>Utilization</span>
          <strong>{dashboardStats.utilization}%</strong>
        </div>
      </section>

      <section className="warehouse-board-toolbar">
        <div className="warehouse-board-toolbar-left">
          <div>
            <h2>Warehouse layout</h2>
            <p>
              {visibleFocusCount} focused ramps • {dashboardStats.total} total
              {lastLocalSave ? ` • saved at ${lastLocalSave.toLocaleTimeString()}` : ""}
            </p>
          </div>

          <div className="selected-ramp-chip">
            <span>Selected ramp</span>
            <strong>{selectedRamp ?? "None"}</strong>
          </div>
        </div>

        <div className="warehouse-board-toolbar-right">
          <input
            value={rampSearch}
            onChange={(event) => setRampSearch(event.target.value)}
            className="ramp-search"
            placeholder="Search ramp / truck / trailer"
            inputMode="search"
          />

          <div className="filter-tabs" aria-label="Ramp status filters">
            {(["all", "occupied", "free", "defect"] as RampFilter[]).map((option) => (
              <button
                key={option}
                className={filter === option ? "active" : ""}
                onClick={() => setFilter(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>

          <button
            className="control-button ghost small"
            onClick={() => {
              setRampSearch("")
              setFilter("all")
              setSelectedRamp(null)
            }}
          >
            Reset view
          </button>
        </div>
      </section>

      <WarehouseLayout
        rampStatus={rampStatus}
        selectedRamp={selectedRamp}
        leftRamps={LEFT_RAMPS}
        rightRamps={RIGHT_RAMPS}
        bottomRamps={BOTTOM_RAMPS}
        onRampClick={handleRampClick}
        onSelectRamp={handleSelectRamp}
        onInputChange={handleInputChange}
        onMarkDefect={handleMarkDefect}
        onClearRamp={handleClearRamp}
        isRampMatchingFocus={isRampMatchingFocus}
      />

      <Legend />
    </div>
  )
}

export default memo(WarehouseVisualizationContent)
