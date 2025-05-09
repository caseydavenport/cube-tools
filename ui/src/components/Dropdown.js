import React from 'react'

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
           <option key={option.label} className="select-option" file={option.value}>{option.value}</option>
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
  return (
    <div className={className}>
      {input.label}
      <input onChange={input.onChange} className="text-input" type="text" />
    </div>
  );
}

export function DateSelector(input) {
  return (
    <div className="dropdown">
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
