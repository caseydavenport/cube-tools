import React from 'react'

// DropdownHeader is a dropdown selector that sits on top of a widget.
export function DropdownHeader({ label, value, options, onChange, className }) {
  if (className == null) {
    className = "dropdown-header"
  }
  return (
   <div className={className}>
    {label}
     <select className="select" value={value} onChange={onChange}>
       {
         options.map((option) => (
           <option key={option.label} className="select-option" file={option.value}>{option.value}</option>
         ))
       }
     </select>
   </div>
  )
}

export function Checkbox(input) {
  return (
      <label className="dropdown">
        {input.text}
        <input checked={input.checked} onChange={input.onChange} type="checkbox" />
      </label>
  );
}

export function NumericInput(input) {
  return (
    <label className="numeric-input-side-by-side">
      {input.label}
      <input onChange={input.onChange} className="numeric-input" type="number" />
    </label>
  );
}

export function DateSelector(input) {
  return (
    <div className="dropdown">
      <label>{input.label}</label>
      <input
        type="date"
        id={input.id}
        value={input.value}
        onChange={input.onChange}
      />
    </div>
  )
}

