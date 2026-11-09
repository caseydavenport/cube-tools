import React from "react"
import { Group, TextInput } from "@mantine/core"

// localToday returns today's date as yyyy-mm-dd in the browser's time zone.
// Date.toISOString would give the UTC date, which runs a day ahead every
// evening in the Americas.
export function localToday() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

// newEvent is the starting value for EventFields: today's date and the "local"
// event code.
export function newEvent() {
  return { date: localToday(), eventCode: "local", eventName: "", flight: "" }
}

// EVENT_CODE_PATTERN is what the server accepts as an event code: lowercase
// letters, digits and hyphens.
const EVENT_CODE_PATTERN = /^[a-z0-9-]+$/

// eventProblem says what's wrong with an event's fields, or returns "" when
// they're ready to submit.
export function eventProblem(event) {
  if (!event.date) {
    return "Pick the draft's date."
  }
  if (!EVENT_CODE_PATTERN.test(event.eventCode)) {
    return "The event code takes lowercase letters, digits and hyphens."
  }
  return ""
}

// EventFields edits the facts about the event a draft came from: its date, a
// short event code that groups drafts from one event, the event's name, and
// optionally the flight within it. value is an event from newEvent; onChange
// gets the whole updated event.
export function EventFields({ value, onChange, withFlight }) {
  // setField returns a change handler that updates one field.
  function setField(field) {
    return (e) => onChange({ ...value, [field]: e.target.value })
  }

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <TextInput type="date" label="Date" value={value.date} onChange={setField("date")} required />
      <TextInput
        label="Event code"
        description="Groups drafts from one event"
        placeholder="local"
        value={value.eventCode}
        onChange={setField("eventCode")}
        required
      />
      <TextInput label="Event name" placeholder="Optional" value={value.eventName} onChange={setField("eventName")} />
      {withFlight && (
        <TextInput label="Flight" placeholder="Optional" value={value.flight} onChange={setField("flight")} />
      )}
    </Group>
  )
}
