import React, { useState, useRef, useMemo } from 'react'
import { QueryTermMetadata } from '../utils/Query.js'

// DropdownHeader is a dropdown selector that sits on top of a widget.
export function DropdownHeader({ label, value, options, onChange, className }) {
  if (className == null) {
    className = "dropdown"
  }
  if (options == null) {
    options = []
  }
  return (
   <div className={className}>
    {label}
     <select className="text-input" value={value} onChange={onChange}>
       {
         options.map((option) => (
           <option key={option.label} className="select-option" value={option.value}>{option.label}</option>
         ))
       }
     </select>
   </div>
  )
}

export function Checkbox(input) {
  let className = "dropdown"
  if (input.className != null) {
    className = input.className
  }

  return (
    <div className={className}>
      <label style={{"paddingRight": "10px"}}>
        {input.text}
      </label>
      <input id={input.id} checked={input.checked} onChange={input.onChange} type="checkbox" />
    </div>
  );
}

export function NumericInput(input) {
  let className = "dropdown"
  if (input.className != null) {
    className = input.className
  }
  return (
    <div className={className}>
      <label style={{"paddingRight": "10px"}}>
        {input.label}
      </label>
      <input onChange={input.onChange} className="numeric-input" type="number" />
    </div>
  );
}

export function TextInput(input) {
  let className = "dropdown"
  if (input.className != "") {
    className = input.className
  }
  let inputClass = "text-input"
  if (input.big) {
    inputClass = "search-bar"
    className = "search-bar-container"
  }

  if (!input.big) {
    return (
      <div className={className}>
        {input.label}
        <input
          placeholder={input.placeholder}
          onChange={input.onChange}
          className={inputClass}
          value={input.value}
          type="text"
        />
      </div>
    );
  }

  return <SearchBarWithAutocomplete input={input} className={className} inputClass={inputClass} />
}

// Pure helper functions — defined outside the component to avoid recreation on every render.
function getCurrentFragment(value) {
  const parts = value.split(" ")
  return parts[parts.length - 1] || ""
}

function computeSuggestions(fragment) {
  const lower = fragment.toLowerCase()

  // If the fragment contains an operator, no more term suggestions needed.
  if (lower && QueryTermMetadata.some(m => m.operators.some(op => lower.startsWith(m.term + op)))) {
    return []
  }

  // If empty, show all terms.
  if (!lower) {
    return QueryTermMetadata
  }

  // Filter to matching terms.
  return QueryTermMetadata.filter(m => m.term.startsWith(lower))
}

function computeHelpText(fragment) {
  const lower = fragment.toLowerCase()
  for (const meta of QueryTermMetadata) {
    for (const op of meta.operators) {
      if (lower.startsWith(meta.term + op)) {
        const valueHint = meta.valueType === "number" ? "number" : meta.valueType === "color" ? "color code (e.g. ug, wbr)" : "text"
        return `Expects ${valueHint} — e.g. ${meta.example}`
      }
    }
  }
  return null
}

function SearchBarWithAutocomplete({ input, className, inputClass }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const blurTimeout = useRef(null)
  const inputRef = useRef(null)
  const prevFragmentRef = useRef("")

  const fragment = getCurrentFragment(input.value || "")
  const suggestions = useMemo(() => computeSuggestions(fragment), [fragment])
  const helpText = useMemo(() => computeHelpText(fragment), [fragment])

  // Reset selectedIdx when fragment changes, without a useEffect / extra render cycle.
  // Instead, track the previous fragment in a ref and clamp inline.
  let effectiveIdx = selectedIdx
  if (fragment !== prevFragmentRef.current) {
    prevFragmentRef.current = fragment
    effectiveIdx = 0
  }
  if (suggestions.length > 0) {
    effectiveIdx = Math.min(effectiveIdx, suggestions.length - 1)
  } else {
    effectiveIdx = 0
  }

  function applySuggestion(meta) {
    const value = input.value || ""
    const parts = value.split(" ")
    parts[parts.length - 1] = meta.term + meta.operators[0]
    const newValue = parts.join(" ")
    input.onChange({ target: { value: newValue } })
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  function onKeyDown(e) {
    if (!showDropdown) return

    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx(Math.min(effectiveIdx + 1, suggestions.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx(Math.max(effectiveIdx - 1, 0))
      } else if (e.key === "Tab" || e.key === "Enter") {
        if (fragment.length > 0) {
          e.preventDefault()
          applySuggestion(suggestions[effectiveIdx])
        }
      }
    }

    if (e.key === "Escape") {
      setShowDropdown(false)
    }
  }

  function onFocus() {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current)
    }
    setShowDropdown(true)
  }

  function onBlur() {
    blurTimeout.current = setTimeout(() => {
      setShowDropdown(false)
    }, 150)
  }

  const showPanel = showDropdown && (suggestions.length > 0 || helpText)

  return (
    <div className={className} style={{position: "relative"}}>
      {input.label}
      <input
        ref={inputRef}
        placeholder={input.placeholder}
        onChange={input.onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className={inputClass}
        value={input.value}
        type="text"
      />
      {showPanel && (
        <div className="search-autocomplete">
          {helpText && (
            <div className="search-autocomplete-help">{helpText}</div>
          )}
          {suggestions.map((meta, idx) => (
            <div
              key={meta.term}
              className={"search-autocomplete-item" + (idx === effectiveIdx ? " search-autocomplete-item-selected" : "")}
              onMouseDown={(e) => {
                e.preventDefault()
                applySuggestion(meta)
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="search-autocomplete-term">{meta.term}{meta.operators[0]}</span>
              <span className="search-autocomplete-detail">{meta.description}</span>
              <span className="search-autocomplete-example">{meta.example}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DateSelector(input) {
  return (
    <div className="dropdown date-selector">
      <label style={{"paddingRight": "10px"}}>{input.label}</label>
      <input
        type="date"
        id={input.id}
        value={input.value}
        onChange={input.onChange}
      />
    </div>
  )
}


export function Button(input) {
  let className="button"
  if (input.checked) {
    className="button-selected"
  }
  return (
    <div className="dropdown">
      <button className={className} onClick={input.onClick}>{input.text}</button>
    </div>
  )
}
