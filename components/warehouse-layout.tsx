"use client"

import { useState, useCallback, useMemo, memo, useRef, useEffect } from "react"
import type { RampStatus } from "./warehouse-visualization"
import { useLookup } from "@/contexts/lookup-context"
import RampInputField from "./ramp-input-field"

// Create a default status object to use as fallback
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

interface WarehouseLayoutProps {
  rampStatus: Record<number, RampStatus>
  onRampClick: (rampNumber: number) => void
  onInputChange: (rampNumber: number, value: string, inputType: "truck" | "trailer") => void
  orientation: "portrait" | "landscape"
  selectedRamp?: number | null
}

// Warehouse configuration with EXACTLY equal input sizes
const config = {
  buildingX: 250,
  buildingY: 50,
  buildingWidth: 1400,
  buildingHeight: 1100,
  bottomSectionHeight: 150,
  leftRampCount: 17, // 60-44
  rightRampCount: 16, // 20-35
  bottomRampCount: 8, // 36-43
  // EXACTLY the same width for both truck and trailer inputs
  inputWidth: 100, // Single width value for ALL inputs
  truckOffset: 100,
  svgWidth: 1900,
  svgHeight: 1300,
  parkingZoneWidth: 180,
}

// Memoized truck component (top-down articulated semi-truck)
// We keep the app "skeleton" intact — only the SVG drawing + animation target.
const Truck = memo(
  ({
    x,
    y,
    side,
    flip, // kept for backward compatibility with the existing call site
    animationClass,
  }: { x: number; y: number; side: string; flip: boolean; animationClass: string }) => {
    // Top-view semi truck. The dock contact point is the rear of the trailer at x=0.
    // The complete truck extends backwards on the negative X axis, then the whole drawing is rotated by side.
    const rotation = side === "bottom" ? 270 : side === "right" ? 180 : 0

    const trailerWheels = [
      { x: -52, y: -35 },
      { x: -76, y: -35 },
      { x: -52, y: 27 },
      { x: -76, y: 27 },
      { x: -104, y: -35 },
      { x: -128, y: -35 },
      { x: -104, y: 27 },
      { x: -128, y: 27 },
    ]

    const tractorWheels = [
      { x: -292, y: -34 },
      { x: -316, y: -34 },
      { x: -292, y: 26 },
      { x: -316, y: 26 },
      { x: -366, y: -30 },
      { x: -366, y: 22 },
    ]

    return (
      <g
        className={`truck-motion realistic-truck ${animationClass}`}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
          {/* Ground shadow */}
          <g opacity="0.26" transform="translate(-4, 5)">
            <rect x="-238" y="-34" width="238" height="68" rx="12" fill="#020617" />
            <rect x="-384" y="-38" width="148" height="76" rx="18" fill="#020617" />
          </g>

          {/* Trailer body */}
          <g className="truck-trailer-body">
            <rect x="-238" y="-31" width="238" height="62" rx="9" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
            <rect x="-229" y="-23" width="220" height="46" rx="6" fill="#ffffff" opacity="0.9" />
            <line x1="-119" y1="-23" x2="-119" y2="23" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="-12" y1="-23" x2="-12" y2="23" stroke="#cbd5e1" strokeWidth="2" />
            {Array.from({ length: 10 }).map((_, index) => (
              <line
                key={`trailer-rib-${index}`}
                x1={-218 + index * 20}
                y1="-27"
                x2={-218 + index * 20}
                y2="27"
                stroke="#94a3b8"
                strokeWidth="1"
                opacity="0.25"
              />
            ))}
            <rect x="-224" y="-29" width="190" height="4" rx="2" fill="#fbbf24" opacity="0.75" />
            <rect x="-224" y="25" width="190" height="4" rx="2" fill="#fbbf24" opacity="0.75" />

            {/* Rear doors / dock side */}
            <rect x="-9" y="-29" width="9" height="58" rx="3" fill="#111827" />
            <line x1="-5" y1="-22" x2="-5" y2="22" stroke="#e2e8f0" strokeWidth="1.5" opacity="0.75" />
            <circle cx="-16" cy="-19" r="4" fill="#ef4444" />
            <circle cx="-16" cy="19" r="4" fill="#ef4444" />

            {/* Landing gear */}
            <rect x="-185" y="-39" width="8" height="11" rx="2" fill="#0f172a" />
            <rect x="-185" y="28" width="8" height="11" rx="2" fill="#0f172a" />
            <rect x="-183" y="-26" width="4" height="52" rx="2" fill="#334155" opacity="0.9" />
          </g>

          {/* Kingpin / fifth wheel */}
          <g className="truck-coupling">
            <rect x="-257" y="-17" width="22" height="34" rx="7" fill="#111827" opacity="0.9" />
            <circle cx="-244" cy="0" r="7" fill="#475569" />
          </g>

          {/* Tractor group articulates during the animation */}
          <g className="truck-tractor">
            {/* Rear frame */}
            <rect x="-116" y="-23" width="112" height="46" rx="10" fill="#0f172a" />
            <rect x="-103" y="-30" width="46" height="7" rx="3.5" fill="#94a3b8" opacity="0.85" />
            <rect x="-103" y="23" width="46" height="7" rx="3.5" fill="#94a3b8" opacity="0.85" />

            {/* Sleeper/cab body */}
            <path
              d="M -132 -34 h 68 c 13 0 24 11 24 24 v 20 c 0 13 -11 24 -24 24 h -70 c -12 0 -22 -10 -22 -22 v -24 c 0 -12 10 -22 24 -22 z"
              fill="#2563eb"
              stroke="#0f172a"
              strokeWidth="2"
            />
            <rect x="-124" y="-26" width="48" height="52" rx="8" fill="#1d4ed8" opacity="0.9" />
            <rect x="-72" y="-25" width="18" height="50" rx="6" fill="#0f172a" opacity="0.35" />

            {/* Hood / front nose */}
            <path
              d="M -156 -26 h -32 c -13 0 -23 10 -23 23 v 6 c 0 13 10 23 23 23 h 32 z"
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth="2"
            />
            <rect x="-208" y="-13" width="13" height="26" rx="4" fill="#111827" />
            <line x1="-203" y1="-9" x2="-203" y2="9" stroke="#64748b" strokeWidth="2" />

            {/* Windows */}
            <path d="M -143 -25 h 28 v 18 h -36 c 1 -8 4 -14 8 -18 z" fill="#bae6fd" opacity="0.95" />
            <path d="M -143 25 h 28 v -18 h -36 c 1 8 4 14 8 18 z" fill="#bae6fd" opacity="0.9" />
            <rect x="-109" y="-24" width="18" height="14" rx="3" fill="#7dd3fc" opacity="0.82" />
            <rect x="-109" y="10" width="18" height="14" rx="3" fill="#7dd3fc" opacity="0.82" />

            {/* Mirrors */}
            <rect x="-151" y="-43" width="15" height="5" rx="2" fill="#111827" />
            <rect x="-151" y="38" width="15" height="5" rx="2" fill="#111827" />

            {/* Headlights */}
            <circle cx="-213" cy="-15" r="5" fill="#fef3c7" />
            <circle cx="-213" cy="15" r="5" fill="#fef3c7" />
            <circle cx="-213" cy="-15" r="9" fill="#fde68a" opacity="0.16" />
            <circle cx="-213" cy="15" r="9" fill="#fde68a" opacity="0.16" />
          </g>

          {/* Trailer wheels */}
          {trailerWheels.map((wheel, index) => (
            <g key={`trailer-wheel-${index}`} className="truck-wheel" transform={`translate(${wheel.x}, ${wheel.y})`}>
              <rect x="-9" y="-6" width="18" height="12" rx="4" fill="#020617" />
              <rect x="-4" y="-3" width="8" height="6" rx="2" fill="#94a3b8" opacity="0.82" />
            </g>
          ))}

          {/* Tractor wheels */}
          {tractorWheels.map((wheel, index) => (
            <g key={`tractor-wheel-${index}`} className="truck-wheel" transform={`translate(${wheel.x}, ${wheel.y})`}>
              <rect x="-10" y="-6" width="20" height="12" rx="4" fill="#020617" />
              <rect x="-4" y="-3" width="8" height="6" rx="2" fill="#94a3b8" opacity="0.82" />
            </g>
          ))}
        </g>
      </g>
    )
  },
)

Truck.displayName = "Truck"

// Memoized ramp component
const Ramp = memo(
  ({
    rampNum,
    x,
    y,
    rotation,
    status,
    onClick,
    selected,
  }: {
    rampNum: number
    x: number
    y: number
    rotation: number
    status: RampStatus
    onClick: () => void
    selected?: boolean
  }) => (
    <>
      {/* Loading dock detail */}
      <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
        <rect x="-30" y="-25" width="60" height="50" fill="#555555" stroke="#444444" strokeWidth="1" rx="2" />
        <rect x="-25" y="-20" width="50" height="40" fill="#666666" stroke="#555555" strokeWidth="1" rx="2" />
      </g>

      {/* Ramp */}
      <g
        className={`ramp ${status.active ? "active" : ""} ${status.yellow ? "yellow" : ""} ${selected ? "selected" : ""}`}
        onClick={onClick}
        transform={`translate(${x}, ${y}) rotate(${rotation})`}
      >
        {/* Ramp base */}
        <rect className="ramp-base" x="-25" y="-20" width="50" height="40" rx="3" />

        {/* Ramp number - always upright */}
        <g transform={`rotate(${-rotation})`}>
          <text className="ramp-number" x="0" y="0" textAnchor="middle" dominantBaseline="middle">
            {rampNum}
          </text>
        </g>
      </g>
    </>
  ),
)

Ramp.displayName = "Ramp"

function WarehouseLayout({
  rampStatus = {},
  onRampClick,
  onInputChange,
  orientation = "landscape",
  selectedRamp = null,
}: WarehouseLayoutProps) {
  // Track recently filled inputs for highlighting
  const [recentlyFilled, setRecentlyFilled] = useState<{
    rampNum: number
    inputType: "truck" | "trailer"
    timestamp: number
  } | null>(null)

  // Store the last lookup values to prevent duplicate lookups
  const lastLookupRef = useRef<Record<number, { truck: string; trailer: string }>>({})

  // Force re-render trigger for lookups
  const [lookupUpdateTrigger, setLookupUpdateTrigger] = useState(0)

  // Get lookup functions from context
  const { lookupTrailerByTruck, lookupTruckByTrailer, dataCount } = useLookup()

  // Listen for lookup data changes to force re-evaluation
  useEffect(() => {
    const handleLookupDataChanged = (event: CustomEvent) => {
      console.log(`🔄 Warehouse received lookup data change: ${event.detail.dataCount} entries`)
      setLookupUpdateTrigger((prev) => prev + 1)
      // Clear the last lookup cache to force fresh lookups
      lastLookupRef.current = {}
    }

    window.addEventListener("lookupDataChanged", handleLookupDataChanged as EventListener)

    return () => {
      window.removeEventListener("lookupDataChanged", handleLookupDataChanged as EventListener)
    }
  }, [])

  // Calculate positions for ramps around the warehouse - ALL inputs use the same width
  const rampPositions = useMemo(() => {
    const positions: Record<
      number,
      {
        x: number
        y: number
        truckInputX: number
        truckInputY: number
        trailerInputX: number
        trailerInputY: number
        side: "bottom" | "left" | "right"
        inputWidth: number
      }
    > = {}

    const sideRampAreaHeight = config.buildingHeight - config.bottomSectionHeight
    const maxRampCount = Math.max(config.leftRampCount, config.rightRampCount)
    const sideRampSpacing = sideRampAreaHeight / maxRampCount

    // Left side ramps (60-44) - EXACTLY the same width for both inputs
    for (let i = 0; i < config.leftRampCount; i++) {
      const rampNumber = 60 - i
      const y = config.buildingY + (i + 0.5) * sideRampSpacing
      positions[rampNumber] = {
        x: config.buildingX,
        y: y,
        // Truck input - using config.inputWidth
        truckInputX: config.buildingX + 70,
        truckInputY: y - 20,
        // Trailer input - using EXACTLY the same config.inputWidth
        trailerInputX: config.buildingX + 180,
        trailerInputY: y - 20,
        side: "left",
        inputWidth: config.inputWidth, // SAME width for both
      }
    }

    // Right side ramps (20-35) - EXACTLY the same width for both inputs
    for (let i = 0; i < config.rightRampCount; i++) {
      const rampNumber = 20 + i
      const y = config.buildingY + (i + 0.5) * sideRampSpacing
      positions[rampNumber] = {
        x: config.buildingX + config.buildingWidth,
        y: y,
        // Truck input - using config.inputWidth
        truckInputX: config.buildingX + config.buildingWidth - 180,
        truckInputY: y - 20,
        // Trailer input - using EXACTLY the same config.inputWidth
        trailerInputX: config.buildingX + config.buildingWidth - 290,
        trailerInputY: y - 20,
        side: "right",
        inputWidth: config.inputWidth, // SAME width for both
      }
    }

    // Bottom ramps (36-43) - EXACTLY the same width for both inputs
    const bottomRampSpacing = config.buildingWidth / config.bottomRampCount
    for (let i = 0; i < config.bottomRampCount; i++) {
      const rampNumber = 43 - i
      const x = config.buildingX + (i + 0.5) * bottomRampSpacing

      // Use a consistent width for bottom inputs too
      const bottomInputWidth = Math.min(bottomRampSpacing - 30, config.inputWidth)

      positions[rampNumber] = {
        x: x,
        y: config.buildingY + config.buildingHeight,
        // Truck input - using bottomInputWidth
        truckInputX: x - bottomInputWidth / 2,
        truckInputY: config.buildingY + config.buildingHeight - 85,
        // Trailer input - using EXACTLY the same bottomInputWidth
        trailerInputX: x - bottomInputWidth / 2,
        trailerInputY: config.buildingY + config.buildingHeight - 135,
        side: "bottom",
        inputWidth: bottomInputWidth, // SAME width for both
      }
    }

    return positions
  }, [])

  // Generate grid lines - memoized for performance
  const gridLines = useMemo(() => {
    const lines = []
    const sideRampAreaHeight = config.buildingHeight - config.bottomSectionHeight
    const parkingZoneEndLeft = config.buildingX - config.parkingZoneWidth
    const parkingZoneEndRight = config.buildingX + config.buildingWidth + config.parkingZoneWidth
    const parkingZoneEndBottom = config.buildingY + config.buildingHeight + config.parkingZoneWidth

    const maxRampCount = Math.max(config.leftRampCount, config.rightRampCount)
    const sideRampSpacing = sideRampAreaHeight / maxRampCount

    // Left side grid lines (horizontal)
    for (let i = 0; i <= maxRampCount; i++) {
      const y = config.buildingY + i * sideRampSpacing
      lines.push(
        <line
          key={`left-grid-${i}`}
          className="grid-line"
          x1={parkingZoneEndLeft}
          y1={y}
          x2={config.buildingX}
          y2={y}
        />,
      )
    }

    // Right side grid lines (horizontal)
    for (let i = 0; i <= config.rightRampCount; i++) {
      const y = config.buildingY + i * sideRampSpacing
      lines.push(
        <line
          key={`right-grid-${i}`}
          className="grid-line"
          x1={config.buildingX + config.buildingWidth}
          y1={y}
          x2={parkingZoneEndRight}
          y2={y}
        />,
      )
    }

    // Bottom grid lines (vertical)
    const bottomRampSpacing = config.buildingWidth / config.bottomRampCount
    for (let i = 0; i < config.bottomRampCount; i++) {
      const x = config.buildingX + i * bottomRampSpacing
      lines.push(
        <line
          key={`bottom-grid-${i}`}
          className="grid-line"
          x1={x}
          y1={config.buildingY + config.buildingHeight}
          x2={x}
          y2={parkingZoneEndBottom}
        />,
      )
    }

    return lines
  }, [])

  // Safe click handler
  const handleRampClick = useCallback(
    (rampNum: number) => {
      if (typeof onRampClick === "function") {
        onRampClick(rampNum)
      }
    },
    [onRampClick],
  )

  // Enhanced input handler with real-time lookup functionality - now with immediate lookup trigger
  const handleInputChange = useCallback(
    (rampNum: number, value: string, inputType: "truck" | "trailer") => {
      if (typeof onInputChange !== "function") return

      // Initialize the last lookup record for this ramp if it doesn't exist
      if (!lastLookupRef.current[rampNum]) {
        lastLookupRef.current[rampNum] = { truck: "", trailer: "" }
      }

      // First, update the current input field
      onInputChange(rampNum, value, inputType)

      // If the value is being cleared (deleted), also clear the associated field
      if (value.trim() === "") {
        const otherInputType = inputType === "truck" ? "trailer" : "truck"

        // Check if the other field has a value before clearing
        const currentStatus = rampStatus[rampNum] || createDefaultStatus()
        const otherFieldValue = inputType === "truck" ? currentStatus.trailerValue : currentStatus.truckValue

        if (otherFieldValue && otherFieldValue.trim() !== "") {
          // Clear the other field
          onInputChange(rampNum, "", otherInputType)
        }

        // Reset the last lookup value for this input type
        lastLookupRef.current[rampNum][inputType] = ""
        return
      }

      // Skip lookup if no data is loaded
      if (dataCount === 0) {
        console.log(`🚫 No lookup data available (dataCount: ${dataCount})`)
        return
      }

      // Check if we've already looked up this exact value to prevent duplicate lookups
      // BUT allow re-lookup if lookup data has changed (different trigger)
      const lookupKey = `${value}-${lookupUpdateTrigger}`
      if (lastLookupRef.current[rampNum][inputType] === lookupKey) {
        return
      }

      // Update the last lookup value with trigger
      lastLookupRef.current[rampNum][inputType] = lookupKey

      console.log(`🔍 Performing lookup for ${inputType}: "${value}" (trigger: ${lookupUpdateTrigger})`)

      // Perform the lookup based on input type
      if (inputType === "truck") {
        // If truck number is entered, look up the trailer
        const trailer = lookupTrailerByTruck(value)

        if (trailer) {
          // Only update if we found a match and the trailer field is different
          const currentStatus = rampStatus[rampNum] || createDefaultStatus()

          if (currentStatus.trailerValue !== trailer) {
            // Update the trailer field
            onInputChange(rampNum, trailer, "trailer")

            // Mark this field as recently filled for highlighting
            setRecentlyFilled({
              rampNum,
              inputType: "trailer",
              timestamp: Date.now(),
            })

            // Clear the highlight after 2 seconds
            setTimeout(() => {
              setRecentlyFilled((current) => {
                if (current?.rampNum === rampNum && current?.inputType === "trailer") {
                  return null
                }
                return current
              })
            }, 2000)

            console.log(`✅ Truck lookup success: ${value} → ${trailer}`)
          }
        } else {
          // If no match found and there's a value in the trailer field, clear it
          const currentStatus = rampStatus[rampNum] || createDefaultStatus()
          if (currentStatus.trailerValue) {
            onInputChange(rampNum, "", "trailer")
            console.log(`❌ Truck lookup failed: ${value} (cleared trailer)`)
          }
        }
      } else if (inputType === "trailer") {
        // If trailer number is entered, look up the truck
        const truck = lookupTruckByTrailer(value)

        if (truck) {
          // Only update if we found a match and the truck field is different
          const currentStatus = rampStatus[rampNum] || createDefaultStatus()

          if (currentStatus.truckValue !== truck) {
            // Update the truck field
            onInputChange(rampNum, truck, "truck")

            // Mark this field as recently filled for highlighting
            setRecentlyFilled({
              rampNum,
              inputType: "truck",
              timestamp: Date.now(),
            })

            // Clear the highlight after 2 seconds
            setTimeout(() => {
              setRecentlyFilled((current) => {
                if (current?.rampNum === rampNum && current?.inputType === "truck") {
                  return null
                }
                return current
              })
            }, 2000)

            console.log(`✅ Trailer lookup success: ${value} → ${truck}`)
          }
        } else {
          // If no match found and there's a value in the truck field, clear it
          const currentStatus = rampStatus[rampNum] || createDefaultStatus()
          if (currentStatus.truckValue) {
            onInputChange(rampNum, "", "truck")
            console.log(`❌ Trailer lookup failed: ${value} (cleared truck)`)
          }
        }
      }
    },
    [onInputChange, rampStatus, dataCount, lookupTrailerByTruck, lookupTruckByTrailer, lookupUpdateTrigger],
  )

  // Function to get truck position and animation classes based on ramp position
  const getTruckPosition = useCallback((rampX: number, rampY: number, side: string, isExiting: boolean) => {
    // Rear bumper (dock contact) sits almost on the ramp face.
    // Tiny offsets keep the ramp still visible and avoid overlapping click targets.
    const dockOffset = 2

    switch (side) {
      case "left":
        return {
          x: rampX - dockOffset,
          y: rampY,
          flip: false,
          animationClass: isExiting ? "truck-left-exit" : "truck-left-enter",
        }
      case "right":
        return {
          x: rampX + dockOffset,
          y: rampY,
          flip: true,
          animationClass: isExiting ? "truck-right-exit" : "truck-right-enter",
        }
      case "bottom":
        return {
          x: rampX,
          y: rampY + dockOffset,
          flip: false,
          animationClass: isExiting ? "truck-bottom-exit" : "truck-bottom-enter",
        }
      default:
        return {
          x: rampX,
          y: rampY,
          flip: false,
          animationClass: "",
        }
    }
  }, [])

  // Adjust input field height based on orientation
  const inputHeight = orientation === "portrait" ? "50" : "40"

  // Adjust central area for wider layout
  const centralAreaWidth = config.buildingWidth - 700

  // Function to determine if an input should be highlighted
  const isHighlighted = useCallback(
    (rampNum: number, inputType: "truck" | "trailer") => {
      return recentlyFilled?.rampNum === rampNum && recentlyFilled?.inputType === inputType
    },
    [recentlyFilled],
  )

  return (
    <svg width={config.svgWidth} height={config.svgHeight} viewBox={`0 0 ${config.svgWidth} ${config.svgHeight}`}>
      <defs>
        <linearGradient id="yardGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="hallGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1f2937" />
        </linearGradient>
        <filter id="softShadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#020617" floodOpacity="0.22" />
        </filter>
      </defs>
      <rect x="0" y="0" width={config.svgWidth} height={config.svgHeight} fill="url(#yardGradient)" />

      {/* Parking areas */}
      <rect
        x={config.buildingX - config.parkingZoneWidth}
        y={config.buildingY}
        width={config.parkingZoneWidth}
        height={config.buildingHeight}
        fill="#64748b"
      />
      <rect
        x={config.buildingX + config.buildingWidth}
        y={config.buildingY}
        width={config.parkingZoneWidth}
        height={config.buildingHeight}
        fill="#64748b"
      />
      <rect
        x={config.buildingX}
        y={config.buildingY + config.buildingHeight}
        width={config.buildingWidth}
        height={config.parkingZoneWidth}
        fill="#64748b"
      />

      {/* Main warehouse building */}
      <rect
        x={config.buildingX}
        y={config.buildingY}
        width={config.buildingWidth}
        height={config.buildingHeight}
        fill="url(#hallGradient)"
        stroke="#0f172a"
        strokeWidth="8"
        rx="18"
        filter="url(#softShadow)"
      />

      {/* Central area */}
      <rect
        x={config.buildingX + (config.buildingWidth - centralAreaWidth) / 2}
        y={config.buildingY + 50}
        width={centralAreaWidth}
        height={config.buildingHeight - 200}
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth="2"
      />

      <text x={config.buildingX + config.buildingWidth / 2} y={config.buildingY + 115} textAnchor="middle" className="warehouse-hall-label">
        WAREHOUSE HALL
      </text>
      <text x={config.buildingX + 170} y={config.buildingY + 42} textAnchor="middle" className="warehouse-zone-label">
        60 → 44
      </text>
      <text x={config.buildingX + config.buildingWidth - 170} y={config.buildingY + 42} textAnchor="middle" className="warehouse-zone-label">
        20 → 35
      </text>
      <text x={config.buildingX + config.buildingWidth / 2} y={config.buildingY + config.buildingHeight - 118} textAnchor="middle" className="warehouse-zone-label">
        43 → 36
      </text>

      {/* Input areas */}
      <rect
        x={config.buildingX + 60}
        y={config.buildingY + 20}
        width="320"
        height={config.buildingHeight - 40}
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth="1"
      />
      <rect
        x={config.buildingX + config.buildingWidth - 380}
        y={config.buildingY + 20}
        width="320"
        height={config.buildingHeight - 40}
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth="1"
      />
      <rect
        x={config.buildingX + 80}
        y={config.buildingY + config.buildingHeight - 150}
        width={config.buildingWidth - 160}
        height="100"
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth="1"
      />

      {/* Grid lines */}
      {gridLines}

      {/* Ramps, trucks, and inputs */}
      {Object.entries(rampPositions).map(([rampNumberStr, position]) => {
        const rampNum = Number.parseInt(rampNumberStr, 10)

        // Ensure we have a valid status object with all required properties
        const status = rampStatus?.[rampNum] || createDefaultStatus()

        // Determine if we should show a truck
        const showTruck = (status.active || status.red || status.isExiting) && status.hasTruck

        // Get truck position and animation class
        const truckPosition = getTruckPosition(position.x, position.y, position.side, status.isExiting || false)

        // Determine ramp orientation
        const rotation = position.side === "bottom" ? 270 : 0

        return (
          <g key={`ramp-group-${rampNum}`} className="ramp-group" data-ramp={rampNum}>
            {/* Ramp with loading dock */}
            <Ramp
              rampNum={rampNum}
              x={position.x}
              y={position.y}
              rotation={rotation}
              status={status}
              selected={selectedRamp === rampNum}
              onClick={() => handleRampClick(rampNum)}
            />

            {/* Truck if ramp is active or exiting */}
            {showTruck && (
              <Truck
                x={truckPosition.x}
                y={truckPosition.y}
                side={position.side}
                flip={truckPosition.flip}
                animationClass={truckPosition.animationClass}
              />
            )}

            {/* Truck input field - EXACTLY the same size as trailer */}
            <foreignObject
              x={position.truckInputX}
              y={position.truckInputY}
              width={position.inputWidth}
              height={inputHeight}
            >
              <div style={{ width: "100%", height: "100%", padding: "0", margin: "0" }}>
                <RampInputField
                  value={status?.truckValue || ""}
                  onChange={(value) => handleInputChange(rampNum, value, "truck")}
                  placeholder="truck"
                  inputType="truck"
                  rampNum={rampNum}
                  isHighlighted={isHighlighted(rampNum, "truck")}
                />
              </div>
            </foreignObject>

            {/* Trailer input field - EXACTLY the same size as truck */}
            <foreignObject
              x={position.trailerInputX}
              y={position.trailerInputY}
              width={position.inputWidth}
              height={inputHeight}
            >
              <div style={{ width: "100%", height: "100%", padding: "0", margin: "0" }}>
                <RampInputField
                  value={status?.trailerValue || ""}
                  onChange={(value) => handleInputChange(rampNum, value, "trailer")}
                  placeholder="trailer"
                  inputType="trailer"
                  rampNum={rampNum}
                  isHighlighted={isHighlighted(rampNum, "trailer")}
                />
              </div>
            </foreignObject>
          </g>
        )
      })}
    </svg>
  )
}

export default memo(WarehouseLayout)
