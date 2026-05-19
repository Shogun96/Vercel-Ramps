"use client"

import { memo } from "react"

interface RampStatus {
  active: boolean
  red: boolean
  yellow: boolean
  inputValue: string
  truckValue: string
  trailerValue: string
  hasTruck: boolean
  isExiting?: boolean
}

interface WarehouseLayoutProps {
  rampStatus: Record<number, RampStatus>
  selectedRamp: number | null
  leftRamps: number[]
  rightRamps: number[]
  bottomRamps: number[]
  onRampClick: (rampNumber: number) => void
  onSelectRamp: (rampNumber: number) => void
  onInputChange: (rampNumber: number, value: string, inputType: "truck" | "trailer") => void
  onMarkDefect: (rampNumber: number) => void
  onClearRamp: (rampNumber: number) => void
  isRampMatchingFocus: (rampNumber: number) => boolean
}

const getRampTone = (status?: RampStatus) => {
  if (!status) return "free"
  if (status.yellow) return "defect"
  if (status.active || status.red || status.truckValue || status.trailerValue) return "occupied"
  return "free"
}

const getRampLabel = (status?: RampStatus) => {
  const tone = getRampTone(status)
  if (tone === "occupied") return "Occupied"
  if (tone === "defect") return "Defect"
  return "Free"
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
  onMarkDefect,
  onClearRamp,
}: {
  rampNumber: number
  status: RampStatus
  selected: boolean
  dimmed: boolean
  compact?: boolean
  onRampClick: (rampNumber: number) => void
  onSelectRamp: (rampNumber: number) => void
  onInputChange: (rampNumber: number, value: string, inputType: "truck" | "trailer") => void
  onMarkDefect: (rampNumber: number) => void
  onClearRamp: (rampNumber: number) => void
}) {
  const tone = getRampTone(status)

  return (
    <div
      className={`warehouse-ramp-card ${tone} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${
        compact ? "compact" : ""
      }`}
      onClick={() => onSelectRamp(rampNumber)}
    >
      <div className="warehouse-ramp-main">
        <button
          type="button"
          className="warehouse-ramp-number"
          onClick={(event) => {
            event.stopPropagation()
            onRampClick(rampNumber)
          }}
          aria-label={`Toggle ramp ${rampNumber}`}
        >
          {rampNumber}
        </button>

        <div className="warehouse-ramp-fields">
          <div className="warehouse-ramp-topline">
            <strong>{getRampLabel(status)}</strong>
          </div>

          <div className="warehouse-ramp-input-grid">
            <input
              type="text"
              className="warehouse-ramp-input"
              placeholder="Truck"
              value={status.truckValue}
              onClick={(event) => event.stopPropagation()}
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
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onInputChange(rampNumber, event.target.value.toUpperCase(), "trailer")}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      <div className="warehouse-ramp-actions">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onMarkDefect(rampNumber)
          }}
        >
          Defect
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClearRamp(rampNumber)
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

function WarehouseLayout({
  rampStatus,
  selectedRamp,
  leftRamps,
  rightRamps,
  bottomRamps,
  onRampClick,
  onSelectRamp,
  onInputChange,
  onMarkDefect,
  onClearRamp,
  isRampMatchingFocus,
}: WarehouseLayoutProps) {
  return (
    <section className="warehouse-layout-shell">
      <div className="warehouse-layout-board">
        <div className="warehouse-layout-left">
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
              onMarkDefect={onMarkDefect}
              onClearRamp={onClearRamp}
            />
          ))}
        </div>

        <div className="warehouse-layout-center">
          <div className="warehouse-layout-yard">
            <div className="warehouse-layout-watermark">WAREHOUSE</div>
            <div className="warehouse-layout-zone-label top-left">Ramps 60 → 44</div>
            <div className="warehouse-layout-zone-label top-right">Ramps 20 → 35</div>
            <div className="warehouse-layout-zone-label bottom-center">Bottom docks 43 → 36</div>
          </div>

          <div className="warehouse-layout-bottom">
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
                onMarkDefect={onMarkDefect}
                onClearRamp={onClearRamp}
              />
            ))}

            <div className="warehouse-office-box">OFFICE</div>
          </div>
        </div>

        <div className="warehouse-layout-right">
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
              onMarkDefect={onMarkDefect}
              onClearRamp={onClearRamp}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default memo(WarehouseLayout)
