import React, { useState, useRef, useEffect } from 'react'
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

function SearchBarWithAutocomplete({ input, className, inputClass }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const blurTimeout = useRef(null)
  const inputRef = useRef(null)

  // Get the current fragment being typed (text after last space).
  function getCurrentFragment(value) {
    const parts = value.split(" ")
    return parts[parts.length - 1] || ""
  }

  // Compute suggestions based on the current fragment.
  function getSuggestions(fragment) {
    const lower = fragment.toLowerCase()

    // If the fragment contains an operator, show help for that term.
    if (lower && QueryTermMetadata.some(m => {
      return m.operators.some(op => lower.startsWith(m.term + op))
    })) {
      return []  // Complete term with operator — no more suggestions needed
    }

    // If empty or no fragment, show all terms.
    if (!lower) {
      return QueryTermMetadata
    }

    // Filter to matching terms.
    const matches = QueryTermMetadata.filter(m => m.term.startsWith(lower))

    // If no matches, hide (user is typing a card name).
    return matches
  }

  // Get contextual help text when a complete term+operator is typed.
  function getHelpText(fragment) {
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

  const fragment = getCurrentFragment(input.value || "")
  const suggestions = getSuggestions(fragment)
  const helpText = getHelpText(fragment)

  // Reset selectedIdx when suggestions change.
  useEffect(() => {
    setSelectedIdx(0)
  }, [suggestions.length, fragment])

  function applySuggestion(meta) {
    const value = input.value || ""
    const parts = value.split(" ")
    // Replace the last fragment with the term + first operator.
    parts[parts.length - 1] = meta.term + meta.operators[0]
    const newValue = parts.join(" ")
    input.onChange({ target: { value: newValue } })
    // Focus the input after applying.
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  function onKeyDown(e) {
    if (!showDropdown) return

    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx(prev => Math.max(prev - 1, 0))
      } else if (e.key === "Tab" || e.key === "Enter") {
        // Only apply suggestion if we have matches and the fragment partially matches a term.
        if (suggestions.length > 0 && fragment.length > 0) {
          e.preventDefault()
          applySuggestion(suggestions[selectedIdx])
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
              className={"search-autocomplete-item" + (idx === selectedIdx ? " search-autocomplete-item-selected" : "")}
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
