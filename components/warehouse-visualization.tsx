"use client"

import type React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import WarehouseLayout from "./warehouse-layout"
import Legend from "./legend"
import HtmlUploader from "./html-uploader"
import { useSupabaseSync } from "@/contexts/supabase-sync-context"
import { useLookup } from "@/contexts/lookup-context"
import { fetchRampMovements, recordRampMovement } from "@/lib/ramp-movements"

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

export type RampState = "occupied" | "free" | "defect"
type RampFilter = "all" | RampState

const RAMP_NUMBERS = Array.from({ length: 41 }, (_, index) => index + 20)
const LEFT_RAMPS = Array.from({ length: 17 }, (_, index) => 60 - index)
const RIGHT_RAMPS = Array.from({ length: 16 }, (_, index) => 20 + index)
const BOTTOM_RAMPS = Array.from({ length: 8 }, (_, index) => 43 - index)

const normalizeValue = (value: string) => value.trim().toUpperCase()

const getDateTimeLocalValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const getStartOfTodayLocal = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return getDateTimeLocalValue(date)
}

const getEndOfTodayLocal = () => {
  const date = new Date()
  date.setHours(23, 59, 0, 0)
  return getDateTimeLocalValue(date)
}

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
  const toolsRef = useRef<HTMLDivElement | null>(null)

  const { syncRampStatus, isSupabaseAvailable, connectionStatus } = useSupabaseSync()
  const { lookupData, lookupTrailerByTruck, lookupTruckByTrailer, addTruckTrailerPair, forceRefresh, dataCount } = useLookup()

  const [rampStatus, setRampStatus] = useState<Record<number, RampStatus>>(initializeRampStatus())
  const [selectedRamp, setSelectedRamp] = useState<number | null>(null)
  const [rampSearch, setRampSearch] = useState("")
  const [filter, setFilter] = useState<RampFilter>("all")
  const [showUploader, setShowUploader] = useState(false)
  const [showChangeTrailer, setShowChangeTrailer] = useState(false)
  const [showMovementsExport, setShowMovementsExport] = useState(false)
  const [movementFrom, setMovementFrom] = useState(getStartOfTodayLocal)
  const [movementTo, setMovementTo] = useState(getEndOfTodayLocal)
  const [movementExportResult, setMovementExportResult] = useState<string | null>(null)
  const [isExportingMovements, setIsExportingMovements] = useState(false)
  const [isToolsPinned, setIsToolsPinned] = useState(false)
  const [changeTruck, setChangeTruck] = useState("")
  const [changeTrailer, setChangeTrailer] = useState("")
  const [changeResult, setChangeResult] = useState<string | null>(null)
  const [isChangingTrailer, setIsChangingTrailer] = useState(false)
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

  const logMovement = useCallback((movement: Parameters<typeof recordRampMovement>[0]) => {
    recordRampMovement(movement).catch((error) => {
      console.warn("Failed to record movement:", error)
    })
  }, [])

  const hasRampChanged = (previous: RampStatus, next: RampStatus) => {
    return (
      getRampStateLabel(previous) !== getRampStateLabel(next) ||
      normalizeValue(previous.truckValue || "") !== normalizeValue(next.truckValue || "") ||
      normalizeValue(previous.trailerValue || "") !== normalizeValue(next.trailerValue || "")
    )
  }

  const findTrailerForTruck = useCallback(
    (truck: string) => {
      const cleanTruck = truck.trim()
      const normalizedTruck = normalizeValue(cleanTruck)
      if (!normalizedTruck) return null

      const directMatch = lookupData.find((item) => normalizeValue(item.truck || "") === normalizedTruck)
      if (directMatch?.trailer) return directMatch.trailer

      return (
        lookupTrailerByTruck(cleanTruck) ||
        lookupTrailerByTruck(cleanTruck.toUpperCase()) ||
        lookupTrailerByTruck(cleanTruck.toLowerCase())
      )
    },
    [lookupData, lookupTrailerByTruck],
  )

  const findTruckForTrailer = useCallback(
    (trailer: string) => {
      const cleanTrailer = trailer.trim()
      const normalizedTrailer = normalizeValue(cleanTrailer)
      const withoutPrefix = normalizedTrailer.startsWith("O-") ? normalizedTrailer.slice(2) : normalizedTrailer
      if (!normalizedTrailer) return null

      const directMatch = lookupData.find((item) => {
        const itemTrailer = normalizeValue(item.trailer || "")
        const itemTrailerWithoutPrefix = itemTrailer.startsWith("O-") ? itemTrailer.slice(2) : itemTrailer
        return itemTrailer === normalizedTrailer || itemTrailerWithoutPrefix === withoutPrefix
      })

      if (directMatch?.truck) return directMatch.truck

      return (
        lookupTruckByTrailer(cleanTrailer) ||
        lookupTruckByTrailer(cleanTrailer.toUpperCase()) ||
        lookupTruckByTrailer(cleanTrailer.toLowerCase()) ||
        lookupTruckByTrailer(withoutPrefix) ||
        lookupTruckByTrailer(`O-${withoutPrefix}`)
      )
    },
    [lookupData, lookupTruckByTrailer],
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


  useEffect(() => {
    if (!isToolsPinned) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || !toolsRef.current) return

      if (!toolsRef.current.contains(target)) {
        setIsToolsPinned(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [isToolsPinned])

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

  const handleResetView = useCallback(() => {
    setRampSearch("")
    setFilter("all")
    setSelectedRamp(null)
  }, [])

  const handleSelectRamp = useCallback((rampNumber: number) => {
    setSelectedRamp(rampNumber)
  }, [])

  const handleRampClick = useCallback(
    (rampNumber: number) => {
      if (!isMounted.current) return
      if (rampNumber < 20 || rampNumber > 60) return

      setRampStatus((previous) => {
        const currentStatus = previous[rampNumber] || createDefaultStatus()
        const isOccupied =
          currentStatus.active ||
          currentStatus.red ||
          currentStatus.yellow ||
          Boolean(currentStatus.truckValue?.trim()) ||
          Boolean(currentStatus.trailerValue?.trim())

        const nextRampStatus = isOccupied
          ? createDefaultStatus()
          : {
              ...createDefaultStatus(),
              active: true,
              red: true,
              yellow: false,
              hasTruck: true,
              isExiting: false,
            }

        const nextStatus = {
          ...previous,
          [rampNumber]: nextRampStatus,
        }

        if (hasRampChanged(currentStatus, nextRampStatus)) {
          logMovement({
            event_type: isOccupied ? "ramp_cleared" : "ramp_status_changed",
            ramp_number: rampNumber,
            previous_status: getRampStateLabel(currentStatus),
            new_status: getRampStateLabel(nextRampStatus),
            previous_truck: currentStatus.truckValue || null,
            new_truck: nextRampStatus.truckValue || null,
            previous_trailer: currentStatus.trailerValue || null,
            new_trailer: nextRampStatus.trailerValue || null,
            truck: nextRampStatus.truckValue || currentStatus.truckValue || null,
            trailer: nextRampStatus.trailerValue || currentStatus.trailerValue || null,
            changed_field: "status",
            source: "ramp_number_click",
            device_id: null,
            notes: isOccupied ? "Ramp cleared by clicking ramp number." : "Ramp marked occupied by clicking ramp number.",
          })
        }

        setSelectedRamp(isOccupied ? null : rampNumber)
        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [logMovement, saveRampStatus],
  )

  const handleInputChange = useCallback(
    (rampNumber: number, value: string, inputType: "truck" | "trailer") => {
      if (!isMounted.current) return

      const cleanValue = normalizeValue(value)
      setSelectedRamp(cleanValue ? rampNumber : null)

      setRampStatus((previous) => {
        const currentStatus = previous[rampNumber] || createDefaultStatus()

        if (!cleanValue) {
          const nextRampStatus = createDefaultStatus()
          const nextStatus = {
            ...previous,
            [rampNumber]: nextRampStatus,
          }

          if (hasRampChanged(currentStatus, nextRampStatus)) {
            logMovement({
              event_type: "ramp_cleared",
              ramp_number: rampNumber,
              previous_status: getRampStateLabel(currentStatus),
              new_status: getRampStateLabel(nextRampStatus),
              previous_truck: currentStatus.truckValue || null,
              new_truck: null,
              previous_trailer: currentStatus.trailerValue || null,
              new_trailer: null,
              truck: currentStatus.truckValue || null,
              trailer: currentStatus.trailerValue || null,
              changed_field: inputType,
              source: "input_cleared",
              device_id: null,
              notes: `${inputType} field cleared; ramp reset to free.`,
            })
          }

          saveRampStatus(nextStatus)
          return nextStatus
        }

        const updatedStatus = {
          ...currentStatus,
          [inputType === "truck" ? "truckValue" : "trailerValue"]: cleanValue,
        }

        if (inputType === "truck" && cleanValue.toLowerCase() !== "defect") {
          const matchingTrailer = findTrailerForTruck(cleanValue)
          updatedStatus.trailerValue = matchingTrailer || ""
        }

        if (inputType === "trailer" && cleanValue.toLowerCase() !== "defect") {
          const matchingTruck = findTruckForTrailer(cleanValue)
          if (matchingTruck) {
            updatedStatus.truckValue = matchingTruck
          }
        }

        updatedStatus.inputValue = `${updatedStatus.truckValue || ""} ${updatedStatus.trailerValue || ""}`.trim()

        const lowerTruckValue = updatedStatus.truckValue?.trim().toLowerCase() || ""
        const lowerTrailerValue = updatedStatus.trailerValue?.trim().toLowerCase() || ""
        const isYellow = lowerTruckValue === "defect" || lowerTrailerValue === "defect"
        const hasAnyInput =
          (lowerTruckValue !== "" && lowerTruckValue !== "defect") ||
          (lowerTrailerValue !== "" && lowerTrailerValue !== "defect")

        const nextRampStatus = {
          ...updatedStatus,
          active: hasAnyInput || isYellow,
          red: hasAnyInput && !isYellow,
          yellow: isYellow,
          hasTruck: hasAnyInput && !isYellow,
          isExiting: false,
        }

        const nextStatus = {
          ...previous,
          [rampNumber]: nextRampStatus,
        }

        if (hasRampChanged(currentStatus, nextRampStatus)) {
          logMovement({
            event_type: "ramp_input_changed",
            ramp_number: rampNumber,
            previous_status: getRampStateLabel(currentStatus),
            new_status: getRampStateLabel(nextRampStatus),
            previous_truck: currentStatus.truckValue || null,
            new_truck: nextRampStatus.truckValue || null,
            previous_trailer: currentStatus.trailerValue || null,
            new_trailer: nextRampStatus.trailerValue || null,
            truck: nextRampStatus.truckValue || null,
            trailer: nextRampStatus.trailerValue || null,
            changed_field: inputType,
            source: "ramp_input",
            device_id: null,
            notes: inputType === "truck" ? "Truck input changed; trailer lookup applied." : "Trailer input changed; truck lookup applied.",
          })
        }

        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [findTrailerForTruck, findTruckForTrailer, logMovement, saveRampStatus],
  )

  const handleChangeTrailerSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const cleanTruck = normalizeValue(changeTruck)
      const cleanTrailer = normalizeValue(changeTrailer)

      if (!cleanTruck || !cleanTrailer) {
        setChangeResult("Truck and trailer are required.")
        return
      }

      setIsChangingTrailer(true)
      setChangeResult(null)

      try {
        const lookupMessage = await addTruckTrailerPair(cleanTruck, cleanTrailer)

        let updatedRampCount = 0
        let previousTrailerFromRamp: string | null = null
        const nextStatus: Record<number, RampStatus> = {}

        RAMP_NUMBERS.forEach((rampNumber) => {
          const current = rampStatus[rampNumber] || createDefaultStatus()
          if (normalizeValue(current.truckValue || "") === cleanTruck) {
            updatedRampCount += 1
            previousTrailerFromRamp = previousTrailerFromRamp || current.trailerValue || null

            const updated = {
              ...current,
              trailerValue: cleanTrailer,
              inputValue: `${current.truckValue || cleanTruck} ${cleanTrailer}`.trim(),
              active: true,
              red: true,
              yellow: false,
              hasTruck: true,
              isExiting: false,
            }

            logMovement({
              event_type: "truck_trailer_changed",
              ramp_number: rampNumber,
              previous_status: getRampStateLabel(current),
              new_status: getRampStateLabel(updated),
              previous_truck: current.truckValue || null,
              new_truck: cleanTruck,
              previous_trailer: current.trailerValue || null,
              new_trailer: cleanTrailer,
              truck: cleanTruck,
              trailer: cleanTrailer,
              changed_field: "trailer",
              source: "change_trailer_tool",
              device_id: null,
              notes: "Trailer changed for truck from Tools.",
            })

            nextStatus[rampNumber] = updated
          } else {
            nextStatus[rampNumber] = current
          }
        })

        if (updatedRampCount === 0) {
          const previousLookupTrailer = findTrailerForTruck(cleanTruck)
          logMovement({
            event_type: "truck_trailer_changed",
            ramp_number: null,
            previous_status: null,
            new_status: null,
            previous_truck: cleanTruck,
            new_truck: cleanTruck,
            previous_trailer: previousLookupTrailer || previousTrailerFromRamp,
            new_trailer: cleanTrailer,
            truck: cleanTruck,
            trailer: cleanTrailer,
            changed_field: "trailer",
            source: "change_trailer_tool",
            device_id: null,
            notes: "Trailer changed for truck in lookup database; truck was not active on a ramp.",
          })
        }

        if (updatedRampCount > 0) {
          setRampStatus(nextStatus)
          saveRampStatus(nextStatus)
        }

        setChangeResult(`${lookupMessage}. Updated ${updatedRampCount} ramp${updatedRampCount === 1 ? "" : "s"}.`)
        setChangeTruck(cleanTruck)
        setChangeTrailer(cleanTrailer)
        forceRefresh().catch(() => {
          // Local update already succeeded. Force refresh is best-effort.
        })
      } catch (error: any) {
        setChangeResult(error?.message || "Trailer change failed.")
      } finally {
        setIsChangingTrailer(false)
      }
    },
    [addTruckTrailerPair, changeTrailer, changeTruck, findTrailerForTruck, forceRefresh, logMovement, rampStatus, saveRampStatus],
  )

  const handleClearAll = useCallback(() => {
    const confirmed = window.confirm("Clear all ramp statuses and local truck/trailer values?")
    if (!confirmed) return

    const nextStatus = initializeRampStatus()

    RAMP_NUMBERS.forEach((rampNumber) => {
      const currentStatus = rampStatus[rampNumber] || createDefaultStatus()
      const nextRampStatus = nextStatus[rampNumber] || createDefaultStatus()

      if (hasRampChanged(currentStatus, nextRampStatus)) {
        logMovement({
          event_type: "clear_all",
          ramp_number: rampNumber,
          previous_status: getRampStateLabel(currentStatus),
          new_status: getRampStateLabel(nextRampStatus),
          previous_truck: currentStatus.truckValue || null,
          new_truck: null,
          previous_trailer: currentStatus.trailerValue || null,
          new_trailer: null,
          truck: currentStatus.truckValue || null,
          trailer: currentStatus.trailerValue || null,
          changed_field: "status",
          source: "tools_clear_all",
          device_id: null,
          notes: "Ramp cleared from Tools clear all.",
        })
      }
    })

    setRampStatus(nextStatus)
    setSelectedRamp(null)
    setRampSearch("")
    setFilter("all")
    saveRampStatus(nextStatus)
  }, [logMovement, rampStatus, saveRampStatus])

  const handleExportMovements = useCallback(async () => {
    const fromDate = new Date(movementFrom)
    const toDate = new Date(movementTo)

    if (!movementFrom || !movementTo || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setMovementExportResult("Please select a valid date/time interval.")
      return
    }

    if (fromDate.getTime() > toDate.getTime()) {
      setMovementExportResult("The start date must be before the end date.")
      return
    }

    setIsExportingMovements(true)
    setMovementExportResult(null)

    try {
      const movements = await fetchRampMovements(fromDate.toISOString(), toDate.toISOString())

      if (movements.length === 0) {
        setMovementExportResult("No movements found in this interval.")
        return
      }

      const excelRows = movements.map((movement) => {
        const date = new Date(movement.created_at)
        return {
          Date: date.toLocaleDateString(),
          Time: date.toLocaleTimeString(),
          "Created at": date.toLocaleString(),
          Event: movement.event_type,
          Ramp: movement.ramp_number ?? "",
          "Previous status": movement.previous_status ?? "",
          "New status": movement.new_status ?? "",
          "Previous truck": movement.previous_truck ?? "",
          "New truck": movement.new_truck ?? "",
          "Previous trailer": movement.previous_trailer ?? "",
          "New trailer": movement.new_trailer ?? "",
          Truck: movement.truck ?? "",
          Trailer: movement.trailer ?? "",
          "Changed field": movement.changed_field ?? "",
          Source: movement.source ?? "",
          Device: movement.device_id ?? "",
          Notes: movement.notes ?? "",
        }
      })

      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(excelRows)

      worksheet["!cols"] = [
        { wch: 14 },
        { wch: 12 },
        { wch: 22 },
        { wch: 24 },
        { wch: 8 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 },
        { wch: 20 },
        { wch: 34 },
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, "Ramp movements")
      XLSX.writeFile(
        workbook,
        `ramp-movements-${movementFrom.replace(/[:T]/g, "-")}_to_${movementTo.replace(/[:T]/g, "-")}.xlsx`,
      )

      setMovementExportResult(`Exported ${movements.length} movement${movements.length === 1 ? "" : "s"}.`)
    } catch (error: any) {
      setMovementExportResult(error?.message || "Could not export movements.")
    } finally {
      setIsExportingMovements(false)
    }
  }, [movementFrom, movementTo])

  return (
    <div id="app" className="warehouse-board-app">
      <header className="warehouse-board-header">
        <div className="warehouse-board-title">
          <div className="warehouse-board-logo">WR</div>
          <div>
            <h1>Warehouse Ramp Status</h1>
            <p>{visibleFocusCount} focused ramps • {dataCount} lookup pairs {lastLocalSave ? `• saved at ${lastLocalSave.toLocaleTimeString()}` : ""}</p>
          </div>
        </div>

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
      </header>

      <WarehouseLayout
        rampStatus={rampStatus}
        selectedRamp={selectedRamp}
        leftRamps={LEFT_RAMPS}
        rightRamps={RIGHT_RAMPS}
        bottomRamps={BOTTOM_RAMPS}
        stats={dashboardStats}
        searchQuery={rampSearch}
        filter={filter}
        onSearchChange={setRampSearch}
        onFilterChange={setFilter}
        onResetView={handleResetView}
        onRampClick={handleRampClick}
        onSelectRamp={handleSelectRamp}
        onInputChange={handleInputChange}
        isRampMatchingFocus={isRampMatchingFocus}
      />

      <Legend />

      <div ref={toolsRef} className={`tools-dock ${isToolsPinned ? "pinned" : ""}`}>
        <button
          type="button"
          className="tools-main"
          aria-label="Tools"
          aria-expanded={isToolsPinned}
          onClick={() => setIsToolsPinned((current) => !current)}
        >
          Tools
        </button>

        <div className="tools-bubbles">
          <button type="button" onClick={() => {
            setShowUploader(true)
            setIsToolsPinned(false)
          }}>
            DB
          </button>
          <button type="button" onClick={() => {
            setMovementExportResult(null)
            setShowMovementsExport(true)
            setIsToolsPinned(false)
          }}>
            CSV
          </button>
          <button type="button" onClick={() => {
            setChangeResult(null)
            setShowChangeTrailer(true)
            setIsToolsPinned(false)
          }}>
            TRL
          </button>
          <button type="button" className="danger" onClick={() => {
            handleClearAll()
            setIsToolsPinned(false)
          }}>
            Clear
          </button>
        </div>
      </div>

      {showUploader ? (
        <div className="database-popout" role="dialog" aria-modal="true" aria-label="Database tools">
          <div className="database-popout-backdrop" onClick={() => setShowUploader(false)} />
          <div className="database-popout-panel">
            <div className="database-popout-header">
              <div>
                <h2>Database tools</h2>
                <p>Lookup upload and database utilities</p>
              </div>
              <button type="button" onClick={() => setShowUploader(false)} aria-label="Close database tools">
                ×
              </button>
            </div>
            <div className="database-popout-content">
              <HtmlUploader />
            </div>
          </div>
        </div>
      ) : null}

      {showMovementsExport ? (
        <div className="database-popout" role="dialog" aria-modal="true" aria-label="Export ramp movements">
          <div className="database-popout-backdrop" onClick={() => setShowMovementsExport(false)} />
          <div className="database-popout-panel movements-export-panel">
            <div className="database-popout-header">
              <div>
                <h2>Export movements</h2>
                <p>Select the interval to export ramp status, truck, trailer and trailer-change movements.</p>
              </div>
              <button type="button" onClick={() => setShowMovementsExport(false)} aria-label="Close export movements">
                ×
              </button>
            </div>

            <form
              className="movements-export-form"
              onSubmit={(event) => {
                event.preventDefault()
                handleExportMovements()
              }}
            >
              <label>
                <span>From</span>
                <input
                  type="datetime-local"
                  value={movementFrom}
                  onChange={(event) => setMovementFrom(event.target.value)}
                />
              </label>

              <label>
                <span>To</span>
                <input
                  type="datetime-local"
                  value={movementTo}
                  onChange={(event) => setMovementTo(event.target.value)}
                />
              </label>

              <button type="submit" disabled={isExportingMovements}>
                {isExportingMovements ? "Exporting..." : "Download Excel"}
              </button>

              {movementExportResult ? <p className="change-trailer-result">{movementExportResult}</p> : null}
            </form>
          </div>
        </div>
      ) : null}

      {showChangeTrailer ? (
        <div className="database-popout" role="dialog" aria-modal="true" aria-label="Change trailer">
          <div className="database-popout-backdrop" onClick={() => setShowChangeTrailer(false)} />
          <div className="database-popout-panel change-trailer-panel">
            <div className="database-popout-header">
              <div>
                <h2>Change trailer</h2>
                <p>Update the truck-trailer pair and the active ramp if that truck is currently used.</p>
              </div>
              <button type="button" onClick={() => setShowChangeTrailer(false)} aria-label="Close change trailer">
                ×
              </button>
            </div>

            <form className="change-trailer-form" onSubmit={handleChangeTrailerSubmit}>
              <label>
                <span>Truck number</span>
                <input
                  value={changeTruck}
                  onChange={(event) => setChangeTruck(event.target.value.toUpperCase())}
                  placeholder="Truck"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>

              <label>
                <span>Trailer now</span>
                <input
                  value={changeTrailer}
                  onChange={(event) => setChangeTrailer(event.target.value.toUpperCase())}
                  placeholder="Trailer"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>

              <button type="submit" disabled={isChangingTrailer}>
                {isChangingTrailer ? "Changing..." : "Change trailer"}
              </button>

              {changeResult ? <p className="change-trailer-result">{changeResult}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default memo(WarehouseVisualizationContent)
