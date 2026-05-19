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
const TRUCK_EXIT_ANIMATION_DURATION = 1800

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
  const containerRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)

  const { syncRampStatus, isInitializing, isSupabaseAvailable, connectionStatus } = useSupabaseSync()

  const [rampStatus, setRampStatus] = useState<Record<number, RampStatus>>({})
  const [scale, setScale] = useState(1)
  const [isReady, setIsReady] = useState(false)
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape")
  const [showUploader, setShowUploader] = useState(false)
  const [selectedRamp, setSelectedRamp] = useState<number | null>(null)
  const [rampSearch, setRampSearch] = useState("")
  const [filter, setFilter] = useState<RampFilter>("all")
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

  const updateOrientation = useCallback(() => {
    if (typeof window === "undefined") return
    setOrientation(window.innerHeight > window.innerWidth ? "portrait" : "landscape")
  }, [])

  const updateScale = useCallback(() => {
    if (!isMounted.current) return

    const container = containerRef.current
    const visualization = document.querySelector("#warehouse-svg") as HTMLElement | null
    if (!container || !visualization) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    const visualizationWidth = visualization.clientWidth
    const visualizationHeight = visualization.clientHeight

    if (!containerWidth || !containerHeight || !visualizationWidth || !visualizationHeight) return

    const safeWidth = Math.max(containerWidth - 24, 100)
    const safeHeight = Math.max(containerHeight - 24, 100)
    const scaleX = safeWidth / visualizationWidth
    const scaleY = safeHeight / visualizationHeight

    const nextScale =
      window.innerHeight > window.innerWidth
        ? Math.min(scaleX, 0.72)
        : Math.min(scaleX, scaleY, 0.96)

    setScale(Math.max(nextScale, 0.18))
  }, [])

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
      } else {
        setRampStatus(initializeRampStatus())
      }
    } catch (error) {
      console.error("Failed to load ramp status from localStorage", error)
      setRampStatus(initializeRampStatus())
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    setIsReady(true)
    updateOrientation()

    const handleResize = () => {
      updateOrientation()
      window.requestAnimationFrame(updateScale)
    }

    const resizeTimer = window.setTimeout(updateScale, 120)

    window.addEventListener("resize", handleResize)
    window.addEventListener("orientationchange", handleResize)

    return () => {
      isMounted.current = false
      window.clearTimeout(resizeTimer)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("orientationchange", handleResize)
    }
  }, [updateOrientation, updateScale])

  useEffect(() => {
    window.requestAnimationFrame(updateScale)
  }, [rampStatus, showUploader, filter, updateScale])

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

  const visibleRampCards = useMemo(() => {
    const search = rampSearch.trim().toLowerCase()

    return RAMP_NUMBERS.map((rampNumber) => {
      const status = rampStatus[rampNumber] || createDefaultStatus()
      const state = getRampState(status)
      return { rampNumber, status, state }
    })
      .filter(({ rampNumber, status, state }) => {
        const matchesFilter = filter === "all" || filter === state
        const searchableText = `${rampNumber} ${status.truckValue || ""} ${status.trailerValue || ""}`.toLowerCase()
        const matchesSearch = search === "" || searchableText.includes(search)
        return matchesFilter && matchesSearch
      })
      .sort((a, b) => {
        const stateOrder = { occupied: 0, defect: 1, free: 2 }
        return stateOrder[a.state] - stateOrder[b.state] || b.rampNumber - a.rampNumber
      })
  }, [filter, rampSearch, rampStatus])

  const toggleUploader = useCallback(() => {
    setShowUploader((previous) => !previous)
  }, [])

  const handleRampClick = useCallback(
    (rampNumber: number) => {
      if (!isMounted.current) return
      if (rampNumber < 20 || rampNumber > 60) return

      setSelectedRamp(rampNumber)

      setRampStatus((previous) => {
        const currentStatus = previous[rampNumber] || createDefaultStatus()

        if (currentStatus.active) {
          const exitingStatus = {
            ...previous,
            [rampNumber]: {
              ...currentStatus,
              isExiting: true,
            },
          }

          setTimeout(() => {
            if (!isMounted.current) return
            setRampStatus((current) => {
              const nextStatus = {
                ...current,
                [rampNumber]: {
                  ...createDefaultStatus(),
                },
              }
              saveRampStatus(nextStatus)
              return nextStatus
            })
          }, TRUCK_EXIT_ANIMATION_DURATION)

          saveRampStatus(exitingStatus)
          return exitingStatus
        }

        const nextStatus = {
          ...previous,
          [rampNumber]: {
            ...currentStatus,
            active: true,
            red: true,
            yellow: false,
            hasTruck: false,
            isExiting: false,
          },
        }

        setTimeout(() => {
          if (!isMounted.current) return
          setRampStatus((current) => {
            const statusWithTruck = {
              ...current,
              [rampNumber]: {
                ...current[rampNumber],
                hasTruck: true,
              },
            }
            saveRampStatus(statusWithTruck)
            return statusWithTruck
          })
        }, 50)

        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [saveRampStatus],
  )

  const handleInputChange = useCallback(
    (rampNumber: number, value: string, inputType: "truck" | "trailer") => {
      if (!isMounted.current) return
      if (rampNumber < 20 || rampNumber > 60) return

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
        const isActive = hasAnyInput || isYellow

        if (!isActive) {
          if (currentStatus.hasTruck) {
            const exitingStatus = {
              ...previous,
              [rampNumber]: {
                ...updatedStatus,
                isExiting: true,
              },
            }

            setTimeout(() => {
              if (!isMounted.current) return
              setRampStatus((current) => {
                const nextStatus = {
                  ...current,
                  [rampNumber]: createDefaultStatus(),
                }
                saveRampStatus(nextStatus)
                return nextStatus
              })
            }, TRUCK_EXIT_ANIMATION_DURATION)

            saveRampStatus(exitingStatus)
            return exitingStatus
          }

          const nextStatus = {
            ...previous,
            [rampNumber]: {
              ...updatedStatus,
              active: false,
              red: false,
              yellow: false,
              hasTruck: false,
              isExiting: false,
            },
          }
          saveRampStatus(nextStatus)
          return nextStatus
        }

        if (isYellow && currentStatus.hasTruck && !currentStatus.yellow) {
          const defectExitingStatus = {
            ...previous,
            [rampNumber]: {
              ...updatedStatus,
              yellow: true,
              red: false,
              active: true,
              isExiting: true,
            },
          }

          setTimeout(() => {
            if (!isMounted.current) return
            setRampStatus((current) => {
              const nextStatus = {
                ...current,
                [rampNumber]: {
                  ...current[rampNumber],
                  active: true,
                  red: false,
                  yellow: true,
                  hasTruck: false,
                  isExiting: false,
                },
              }
              saveRampStatus(nextStatus)
              return nextStatus
            })
          }, TRUCK_EXIT_ANIMATION_DURATION)

          saveRampStatus(defectExitingStatus)
          return defectExitingStatus
        }

        if (!currentStatus.active && isActive && hasAnyInput) {
          const enteringStatus = {
            ...previous,
            [rampNumber]: {
              ...updatedStatus,
              active: true,
              red: true,
              yellow: false,
              hasTruck: false,
              isExiting: false,
            },
          }

          setTimeout(() => {
            if (!isMounted.current) return
            setRampStatus((current) => {
              const nextStatus = {
                ...current,
                [rampNumber]: {
                  ...current[rampNumber],
                  hasTruck: true,
                },
              }
              saveRampStatus(nextStatus)
              return nextStatus
            })
          }, 50)

          saveRampStatus(enteringStatus)
          return enteringStatus
        }

        const nextStatus = {
          ...previous,
          [rampNumber]: {
            ...updatedStatus,
            active: isActive,
            red: hasAnyInput,
            yellow: isYellow,
            hasTruck: hasAnyInput,
            isExiting: false,
          },
        }

        saveRampStatus(nextStatus)
        return nextStatus
      })
    },
    [saveRampStatus],
  )

  const handleSelectRamp = useCallback((rampNumber: number) => {
    setSelectedRamp(rampNumber)
    setRampSearch(String(rampNumber))
  }, [])

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
            inputValue: "defect",
            truckValue: "defect",
            trailerValue: "",
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

  if (!isReady) {
    return (
      <div className="warehouse-loading">
        <div className="warehouse-spinner" />
        <p>Loading ramp board...</p>
      </div>
    )
  }

  if (isInitializing) {
    return (
      <div className="warehouse-loading">
        <div className="warehouse-spinner" />
        <h2>Initializing data connection</h2>
        <p>Preparing the warehouse ramp board...</p>
      </div>
    )
  }

  return (
    <div id="app" className={`warehouse-app ${orientation}`}>
      <header className="warehouse-topbar">
        <div className="warehouse-title-block">
          <div className="warehouse-logo">WR</div>
          <div>
            <h1>Warehouse Ramp Status</h1>
            <p>Live view for ramp occupation, defects, trucks and trailers</p>
          </div>
        </div>

        <div className="warehouse-topbar-actions">
          <div className={`sync-pill ${isSupabaseAvailable && connectionStatus === "connected" ? "online" : "offline"}`}>
            <span />
            {isSupabaseAvailable && connectionStatus === "connected" ? "Lookup DB online" : "Local mode"}
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

      <section className="kpi-grid">
        <StatCard label="Free ramps" value={dashboardStats.free} tone="free" />
        <StatCard label="Occupied" value={dashboardStats.occupied} tone="occupied" />
        <StatCard label="Defect" value={dashboardStats.defect} tone="defect" />
        <StatCard label="Utilization" value={`${dashboardStats.utilization}%`} tone="neutral" />
      </section>

      <section className="warehouse-workspace">
        <div className="hall-card">
          <div className="hall-toolbar">
            <div>
              <h2>Hala rampe</h2>
              <p>
                {dashboardStats.total} ramps • saved locally
                {lastLocalSave ? ` at ${lastLocalSave.toLocaleTimeString()}` : ""}
              </p>
            </div>

            <div className="hall-toolbar-controls">
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
            </div>
          </div>

          <div className="warehouse-container" ref={containerRef}>
            <div
              id="warehouse-svg"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: orientation === "portrait" ? "top center" : "center center",
              }}
            >
              <WarehouseLayout
                rampStatus={rampStatus}
                onRampClick={handleRampClick}
                onInputChange={handleInputChange}
                orientation={orientation}
                selectedRamp={selectedRamp}
              />
            </div>
          </div>
        </div>

        <aside className="ramp-status-panel">
          <div className="panel-header">
            <div>
              <h2>Ramp board</h2>
              <p>{visibleRampCards.length} visible ramps</p>
            </div>
            <button className="control-button ghost small" onClick={() => {
              setRampSearch("")
              setFilter("all")
              setSelectedRamp(null)
            }}>
              Reset view
            </button>
          </div>

          <div className="selected-ramp-card">
            <span>Selected ramp</span>
            <strong>{selectedRamp ?? "None"}</strong>
          </div>

          <div className="ramp-card-list">
            {visibleRampCards.map(({ rampNumber, status, state }) => (
              <div
                key={rampNumber}
                className={`ramp-card ${state} ${selectedRamp === rampNumber ? "selected" : ""}`}
              >
                <button
                  type="button"
                  className="ramp-card-main"
                  onClick={() => handleSelectRamp(rampNumber)}
                >
                  <span className="ramp-card-number">{rampNumber}</span>
                  <span className="ramp-card-details">
                    <strong>{getRampStateLabel(status)}</strong>
                    <small>
                      {status.truckValue || "No truck"} {status.trailerValue ? `• ${status.trailerValue}` : ""}
                    </small>
                  </span>
                </button>

                <div className="ramp-card-actions">
                  <button type="button" onClick={() => handleMarkDefect(rampNumber)}>
                    Defect
                  </button>
                  <button type="button" onClick={() => handleClearRamp(rampNumber)}>
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <Legend />
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone: "free" | "occupied" | "defect" | "neutral"
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default memo(WarehouseVisualizationContent)
