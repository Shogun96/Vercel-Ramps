"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

interface RampInputFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputType: "truck" | "trailer"
  rampNum: number
  isHighlighted?: boolean
}

export default function RampInputField({
  value,
  onChange,
  placeholder,
  inputType,
  rampNum,
  isHighlighted = false,
}: RampInputFieldProps) {
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousValueRef = useRef(value)

  useEffect(() => {
    if (value !== previousValueRef.current) {
      setLocalValue(value)
      previousValueRef.current = value
    }
  }, [value])

  const commitValue = useCallback(
    (nextValue: string) => {
      setLocalValue(nextValue)
      onChange(nextValue)
      previousValueRef.current = nextValue
    },
    [onChange],
  )

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      commitValue(event.target.value.toUpperCase())
    },
    [commitValue],
  )

  const handleBlur = useCallback(() => {
    if (localValue !== previousValueRef.current) {
      commitValue(localValue)
    }
  }, [commitValue, localValue])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      inputRef.current?.blur()
    }
  }, [])

  return (
    <div className={`input-field-shell ${isHighlighted ? "highlight-filled" : ""}`}>
      <span className="input-field-label">{inputType === "truck" ? "TRK" : "TRL"}</span>
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="input-field"
        placeholder={placeholder}
        data-ramp={rampNum}
        data-input-type={inputType}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
      />
      {localValue ? (
        <button
          type="button"
          className="input-clear-button"
          onClick={() => commitValue("")}
          aria-label={`Clear ${inputType} for ramp ${rampNum}`}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
