// HoverStats is the hover popover for label-and-value numbers, such as a
// heatmap cell's record or a card's pick stats, in the kit-pop shell.

import React from "react"
import { HoverCard } from "@mantine/core"
import { HOVER_PROPS, POP_CLASSES, PopTitle, useEscapeToClose } from "./HoverInfo.js"
import { meterWidth, toneClass } from "./hoverStats.js"

// HoverStats shows rows of numbers while the pointer rests on its child. Each
// row is { label, value, tone, share, ends }: tone "good" or "bad" tints the
// value, share (0-1) draws a meter under it, and ends names the meter's two
// ends, such as both sides of a matchup. footer is an optional muted last line.
export function HoverStats({ title, lead, badge, rows = [], footer, width, position = "top", children }) {
  const escape = useEscapeToClose()

  return (
    <HoverCard {...HOVER_PROPS} {...escape} width={width} position={position} withArrow classNames={POP_CLASSES}>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown>
        <PopTitle title={title} lead={lead} badge={badge} />
        {rows.map((row, i) => <StatRow key={i} row={row} />)}
        {footer && <div className="kit-pop-footer">{footer}</div>}
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

// StatRow is one label and value, with the row's meter and end labels when it
// has them.
function StatRow({ row }) {
  let valueClass = "kit-pop-value"
  const tone = toneClass(row.tone)
  if (tone) {
    valueClass = valueClass + " " + tone
  }

  return (
    <>
      <div className="kit-pop-row">
        <span className="kit-pop-label">{row.label}</span>
        <span className={valueClass}>{row.value}</span>
      </div>
      <Meter share={row.share} />
      <MeterEnds ends={row.ends} />
    </>
  )
}

// Meter is the thin bar showing a 0-1 share, or nothing when there's no share.
function Meter({ share }) {
  const width = meterWidth(share)
  if (width === "") {
    return null
  }
  return (
    <div className="kit-pop-meter">
      <span className="kit-pop-meter-fill" style={{ width }} />
    </div>
  )
}

// MeterEnds prints a [left, right] pair of labels under a meter.
function MeterEnds({ ends }) {
  if (!ends || ends.length !== 2) {
    return null
  }
  return (
    <div className="kit-pop-ends">
      <span>{ends[0]}</span>
      <span>{ends[1]}</span>
    </div>
  )
}
