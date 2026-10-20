import React from "react"
import { NumberInput, Select } from "@mantine/core"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"
import { hasData } from "../utils/dataKinds.js"

// StatsSettings are the knobs in the stats toolbar's settings popover: how
// many drafts go in each trend bucket, the smallest draft to count, and how
// sure a win rate must be before it's shown as different from a coin flip.
// filters is the page's useStatsFilters state; info is the cube's data kinds.
export function StatsSettings({ filters, info, copy }) {
  // onBucketSize keeps at least one draft per bucket, including when the box
  // is cleared (0) or holds something that isn't a number (NaN).
  function onBucketSize(value) {
    let size = Number(value)
    if (!(size >= 1)) {
      size = 1
    }
    filters.setBucketSize(size)
  }

  // onDraftSize treats a cleared box as no minimum.
  function onDraftSize(value) {
    let size = Number(value)
    if (!(size >= 0)) {
      size = 0
    }
    filters.setMinDraftSize(size)
  }

  return (
    <>
      <NumberInput size="xs" label={copy.bucketSize} min={1} value={filters.bucketSize} onChange={onBucketSize} />
      <NumberInput size="xs" label={copy.draftSize} min={0} value={filters.minDraftSize} onChange={onDraftSize} />
      <WinConfidence filters={filters} info={info} copy={copy} />
    </>
  )
}

// WinConfidence picks how sure a win rate must be before it's shown as
// different from a coin flip. A cube without results has no win rates, so it
// shows nothing.
function WinConfidence({ filters, info, copy }) {
  if (!hasData(info, "results")) {
    return null
  }

  return (
    <Select
      size="xs"
      label={copy.winConfidence}
      data={WIN_CONFIDENCE_OPTS}
      value={String(filters.winConfidence)}
      onChange={filters.setWinConfidence}
      allowDeselect={false}
      comboboxProps={{ withinPortal: false }}
    />
  )
}
