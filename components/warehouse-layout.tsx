"use client"

import { memo } from "react"
import type { RampStatus, RampState } from "./warehouse-visualization"

type RampFilter = "all" | RampState

interface WarehouseStats {
  total: number
  occupied: number
  defect: number
  free: number
  utilization: number
}

interface WarehouseLayoutProps {
  rampStatus: Record<number, RampStatus>
  selectedRamp: number | null
  leftRamps: number[]
  rightRamps: number[]
  bottomRamps: number[]
  stats: WarehouseStats
  searchQuery: string
  filter: RampFilter
  onSearchChange: (value: string) => void
  onFilterChange: (value: RampFilter) => void
  onResetView: () => void
  onRampClick: (rampNumber: number) => void
  onSelectRamp: (rampNumber: number) => void
  onInputChange: (rampNumber: number, value: string, inputType: "truck" | "trailer") => void
  isRampMatchingFocus: (rampNumber: number) => boolean
}

const getRampTone = (status?: RampStatus) => {
  if (!status) return "free"
  if (status.yellow) return "defect"
  if (status.active || status.red || status.truckValue || status.trailerValue) return "occupied"
  return "free"
}

function RampCard({
  rampNumber,
  status,
  selected,
  dimmed,
  compact = false,
  onRampClick,
  onSelectRamp,
  onInputChange,
}: {
  rampNumber: number
  status: RampStatus
  selected: boolean
  dimmed: boolean
  compact?: boolean
  onRampClick: (rampNumber: number) => void
  onSelectRamp: (rampNumber: number) => void
  onInputChange: (rampNumber: number, value: string, inputType: "truck" | "trailer") => void
}) {
  const tone = getRampTone(status)

  return (
    <article
      className={`warehouse-ramp-card ${tone} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${
        compact ? "compact" : ""
      }`}
      onClick={() => onSelectRamp(rampNumber)}
    >
      <div className="warehouse-ramp-content">
        <button
          type="button"
          className="warehouse-ramp-number"
          onClick={(event) => {
            event.stopPropagation()
            onRampClick(rampNumber)
          }}
          aria-label={`Toggle ramp ${rampNumber}`}
          title={`Toggle ramp ${rampNumber}`}
        >
          {rampNumber}
        </button>

        <div className="warehouse-ramp-inputs" onClick={(event) => event.stopPropagation()}>
          <input
            type="text"
            className="warehouse-ramp-input"
            placeholder="Truck"
            value={status.truckValue}
            onChange={(event) => onInputChange(rampNumber, event.target.value.toUpperCase(), "truck")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          <input
            type="text"
            className="warehouse-ramp-input"
            placeholder="Trailer"
            value={status.trailerValue}
            onChange={(event) => onInputChange(rampNumber, event.target.value.toUpperCase(), "trailer")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>
    </article>
  )
}

function WarehouseLayout({
  rampStatus,
  selectedRamp,
  leftRamps,
  rightRamps,
  bottomRamps,
  stats,
  searchQuery,
  filter,
  onSearchChange,
  onFilterChange,
  onResetView,
  onRampClick,
  onSelectRamp,
  onInputChange,
  isRampMatchingFocus,
}: WarehouseLayoutProps) {
  const filters: RampFilter[] = ["all", "occupied", "free", "defect"]

  return (
    <section className="warehouse-layout-shell">
      <div className="warehouse-layout-board">
        <div className="warehouse-layout-left" aria-label="Left ramps">
          {leftRamps.map((rampNumber) => (
            <RampCard
              key={rampNumber}
              rampNumber={rampNumber}
              status={rampStatus[rampNumber]}
              selected={selectedRamp === rampNumber}
              dimmed={!isRampMatchingFocus(rampNumber)}
              onRampClick={onRampClick}
              onSelectRamp={onSelectRamp}
              onInputChange={onInputChange}
            />
          ))}
        </div>

        <div className="warehouse-layout-center">
          <div className="warehouse-layout-yard">
            <div className="warehouse-layout-watermark">WAREHOUSE</div>

            <div className="warehouse-stats-stack" aria-label="Warehouse statistics">
              <div className="warehouse-stat-line free">
                <span>Free ramps</span>
                <strong>{stats.free}</strong>
              </div>
              <div className="warehouse-stat-line occupied">
                <span>Occupied</span>
                <strong>{stats.occupied}</strong>
              </div>
              <div className="warehouse-stat-line defect">
                <span>Defect</span>
                <strong>{stats.defect}</strong>
              </div>
              <div className="warehouse-stat-line utilization">
                <span>Utilization</span>
                <strong>{stats.utilization}%</strong>
              </div>
            </div>

            <div className="warehouse-view-panel" aria-label="Warehouse view controls">
              <div className="warehouse-view-row">
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  className="ramp-search"
                  placeholder="Search"
                  inputMode="search"
                />
                <button type="button" className="reset-view-button" onClick={onResetView}>
                  Reset
                </button>
              </div>

              <div className="filter-stack">
                {filters.map((option) => (
                  <button
                    key={option}
                    className={filter === option ? "active" : ""}
                    onClick={() => onFilterChange(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="warehouse-zone-label top-left">60 → 44</div>
            <div className="warehouse-zone-label top-right">20 → 35</div>
            <div className="warehouse-zone-label bottom-center">43 → 36</div>
          </div>

          <div className="warehouse-layout-bottom" aria-label="Bottom ramps">
            {bottomRamps.map((rampNumber) => (
              <RampCard
                key={rampNumber}
                rampNumber={rampNumber}
                status={rampStatus[rampNumber]}
                selected={selectedRamp === rampNumber}
                dimmed={!isRampMatchingFocus(rampNumber)}
                compact
                onRampClick={onRampClick}
                onSelectRamp={onSelectRamp}
                onInputChange={onInputChange}
                  />
            ))}
          </div>
        </div>

        <div className="warehouse-layout-right" aria-label="Right ramps">
          {rightRamps.map((rampNumber) => (
            <RampCard
              key={rampNumber}
              rampNumber={rampNumber}
              status={rampStatus[rampNumber]}
              selected={selectedRamp === rampNumber}
              dimmed={!isRampMatchingFocus(rampNumber)}
              onRampClick={onRampClick}
              onSelectRamp={onSelectRamp}
              onInputChange={onInputChange}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default memo(WarehouseLayout)
