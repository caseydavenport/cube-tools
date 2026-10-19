import React from 'react'
import { Button as MantineButton, Checkbox as MantineCheckbox, Group, NativeSelect, NumberInput, Text, TextInput } from "@mantine/core"
import { asEvent, optionKey } from "./kit/controls.js"

// The stats pages' shared controls. Each keeps the props and change-event
// shape its callers have always used, and renders the matching Mantine input,
// so every page picks up the kit's look without changing its own code.

// ControlLabel is the short label shown to the left of a control.
function ControlLabel({ children }) {
  if (children == null || children === "") {
    return null
  }
  return <Text size="sm" component="span">{children}</Text>
}

// DropdownHeader is a labeled dropdown of { label, value } options. onChange
// gets the browser change event, so callers read e.target.value.
export function DropdownHeader({ label, value, options, onChange, className }) {
  if (className == null) {
    className = "dropdown"
  }
  if (options == null) {
    options = []
  }

  // Screen readers get the label only when it's plain text.
  let ariaLabel = undefined
  if (typeof label === "string") {
    ariaLabel = label
  }

  return (
    <Group gap={6} wrap="nowrap" className={className}>
      <ControlLabel>{label}</ControlLabel>
      <NativeSelect size="xs" value={value} onChange={onChange} aria-label={ariaLabel}>
        {options.map((option, index) => (
          <option key={optionKey(option, index)} value={option.value}>{option.label}</option>
        ))}
      </NativeSelect>
    </Group>
  )
}

// Checkbox is a labeled checkbox. The id goes on the input itself, since some
// callers read e.currentTarget.id to tell their checkboxes apart.
export function Checkbox({ id, text, checked, onChange, className }) {
  if (className == null) {
    className = "dropdown"
  }

  return (
    <MantineCheckbox
      className={className}
      id={id}
      size="xs"
      label={text}
      labelPosition="left"
      checked={checked}
      onChange={onChange}
    />
  )
}

// NumericInput is a labeled number box. Mantine reports the number itself, so
// it's wrapped in an event shape for callers that read e.target.value.
export function NumericInput({ label, value, onChange, className }) {
  if (className == null) {
    className = "dropdown"
  }

  function onNumber(number) {
    onChange(asEvent(number))
  }

  return (
    <Group gap={6} wrap="nowrap" className={className}>
      <ControlLabel>{label}</ControlLabel>
      <NumberInput size="xs" w={80} value={value} onChange={onNumber} aria-label={label} />
    </Group>
  )
}

// DateSelector is a labeled date box. onChange gets the browser change event,
// with the date as "YYYY-MM-DD" in e.target.value.
export function DateSelector({ label, id, value, onChange }) {
  return (
    <Group gap={6} wrap="nowrap" className="dropdown date-selector">
      <ControlLabel>{label}</ControlLabel>
      <TextInput size="xs" type="date" id={id} value={value} onChange={onChange} aria-label={label} />
    </Group>
  )
}

// Button is a small button; checked draws it filled, as a toggle that's on.
export function Button({ text, onClick, checked }) {
  let variant = "default"
  if (checked) {
    variant = "filled"
  }

  return (
    <MantineButton size="xs" variant={variant} onClick={onClick}>
      {text}
    </MantineButton>
  )
}
