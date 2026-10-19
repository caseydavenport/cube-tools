import React, { useState } from "react"
import { Button, Divider, Popover, Stack, TextInput, UnstyledButton } from "@mantine/core"
import { IconCalendar, IconChevronDown } from "@tabler/icons-react"
import { presetRange, rangeLabel, rangePreset, todayString } from "./dateRanges.js"
import "./toolbar.css"

// PresetOption is one row in the menu that picks a preset range. The current
// preset is shown in the primary color.
function PresetOption({ label, selected, onClick }) {
  let className = "se-range-option"
  if (selected) {
    className += " se-range-option-selected"
  }

  return (
    <UnstyledButton className={className} onClick={onClick}>
      {label}
    </UnstyledButton>
  )
}

// CustomRangeForm holds two date inputs and an Apply button. The dates are kept
// here until Apply, so the page doesn't reload its data on every keystroke.
function CustomRangeForm({ start, end, onApply, copy }) {
  const [draftStart, setDraftStart] = useState(start)
  const [draftEnd, setDraftEnd] = useState(end)

  return (
    <div className="se-range-custom">
      <TextInput
        type="date"
        size="xs"
        label={copy.from}
        value={draftStart}
        onChange={event => setDraftStart(event.currentTarget.value)}
      />
      <TextInput
        type="date"
        size="xs"
        label={copy.to}
        value={draftEnd}
        onChange={event => setDraftEnd(event.currentTarget.value)}
      />
      <Button size="xs" onClick={() => onApply(draftStart, draftEnd)}>
        {copy.apply}
      </Button>
    </div>
  )
}

// DateRangeMenu is the toolbar button that picks the date range every browse
// page filters by. Its label names the current range; clicking it offers the
// presets ("All time", "Last 12 months") and a custom range form.
//
// It's a Popover rather than a Menu because a Menu's arrow-key handling would
// fight with typing in the custom range's date inputs.
export function DateRangeMenu({ start, end, onChange, copy }) {
  const [opened, setOpened] = useState(false)
  const now = todayString()
  const preset = rangePreset(start, end, now)

  // choose applies a range and closes the popover.
  function choose(nextStart, nextEnd) {
    onChange(nextStart, nextEnd)
    setOpened(false)
  }

  // choosePreset applies one of the named ranges.
  function choosePreset(name) {
    const range = presetRange(name, now)
    choose(range.start, range.end)
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" width={220}>
      <Popover.Target>
        <Button
          variant="default"
          size="sm"
          leftSection={<IconCalendar size={16} />}
          rightSection={<IconChevronDown size={14} />}
          onClick={() => setOpened(!opened)}
        >
          {rangeLabel(start, end, now, copy)}
        </Button>
      </Popover.Target>

      <Popover.Dropdown p={4}>
        <Stack gap={0}>
          <PresetOption label={copy.allTime} selected={preset === "all"} onClick={() => choosePreset("all")} />
          <PresetOption label={copy.last12Months} selected={preset === "12m"} onClick={() => choosePreset("12m")} />
        </Stack>

        <Divider my={4} label={copy.customRange} labelPosition="left" />

        {/* The key resets the form's drafts to the current range each time
            the popover opens, discarding anything left unapplied. */}
        <CustomRangeForm key={String(opened)} start={start} end={end} onApply={choose} copy={copy} />
      </Popover.Dropdown>
    </Popover>
  )
}
