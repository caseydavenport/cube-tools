import React, { cloneElement, useEffect, useState } from "react"
import { HoverCard } from "@mantine/core"
import "./popover.css"

// HOVER_PROPS holds the rules every hover popover follows, so they live in one
// place. It opens after 200 ms with Mantine's pop transition, 10px from its
// target, flipping to the other side at a screen edge. It closes the moment the
// pointer leaves the target: the dropdown is pointer-transparent (popover.css),
// so there is no hovering onto it.
export const HOVER_PROPS = {
  openDelay: 200,
  closeDelay: 0,
  offset: 10,
  withinPortal: true,
  middlewares: { flip: true, shift: true },
  transitionProps: { transition: "pop", duration: 120 },
}

// POP_CLASSES gives a Mantine HoverCard the kit-pop shell. Mantine's arrow takes
// its colors from the shell.
export const POP_CLASSES = { dropdown: "kit-pop" }

// useEscapeToClose lets Escape close an open hover popover. Mantine's HoverCard
// can't be closed from outside, so Escape disables it until the pointer leaves
// the target, which resets it for the next hover. Spread the result onto the
// HoverCard.
export function useEscapeToClose() {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!open) {
      return undefined
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setDismissed(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  return {
    disabled: dismissed,
    onOpen: () => setOpen(true),
    onClose: () => {
      setOpen(false)
      setDismissed(false)
    },
  }
}

// HoverInfo shows a small card of extra detail (info, under an optional title)
// while the pointer rests on its child, such as what a column header means or
// the numbers behind a table cell. The child is used as is, so a table cell
// can be the target without breaking the table. lead and badge are optional
// nodes before and after the title, such as mana pips and a game count.
export function HoverInfo({ title, info, width, position = "top", lead, badge, children }) {
  const escape = useEscapeToClose()

  // Mantine gives the target the card's id, so pass the child's own id through.
  // Sortable headers and clickable cells read it back on click.
  let id = undefined
  if (children && children.props && children.props.id) {
    id = String(children.props.id)
  }

  return (
    <HoverCard {...HOVER_PROPS} {...escape} id={id} width={width} position={position} withArrow classNames={popClasses(width, info)}>
      <HoverCard.Target>{markTarget(children, info)}</HoverCard.Target>
      <HoverCard.Dropdown>
        <PopTitle title={title} lead={lead} badge={badge} />
        <PopBody info={info} />
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

// popClasses gives the kit-pop shell, plus kit-pop-prose to wrap plain text
// at a readable width when the caller set no width.
function popClasses(width, info) {
  if (width === undefined && typeof info === "string") {
    return { dropdown: "kit-pop kit-pop-prose" }
  }
  return POP_CLASSES
}

// markTarget adds kit-has-tip to a target that has an explainer, which draws
// the dotted underline on column headers (popover.css).
function markTarget(child, info) {
  if (!hasContent(info) || !child || !child.props) {
    return child
  }
  let className = "kit-has-tip"
  if (child.props.className) {
    className = child.props.className + " kit-has-tip"
  }
  return cloneElement(child, { className })
}

// hasContent reports whether a title or info has anything to show.
function hasContent(value) {
  return value != null && value !== "" && value !== false
}

// PopTitle is a popover's title row: an optional leading node, the title, and
// an optional badge on the right. It draws nothing when all three are empty.
export function PopTitle({ title, lead, badge }) {
  if (!hasContent(title) && !hasContent(lead) && !hasContent(badge)) {
    return null
  }
  return (
    <div className="kit-pop-title">
      {lead}
      <span className="kit-pop-title-text">{title}</span>
      {hasContent(badge) && <span className="kit-pop-badge">{badge}</span>}
    </div>
  )
}

// PopBody shows info text in the muted explainer style. Other nodes, such as a
// HoverTable, are shown as they are.
function PopBody({ info }) {
  if (typeof info === "string") {
    return <p className="kit-pop-text">{info}</p>
  }
  if (!hasContent(info)) {
    return null
  }
  return info
}
