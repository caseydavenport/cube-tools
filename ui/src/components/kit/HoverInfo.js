import React, { cloneElement, useEffect, useRef, useState } from "react"
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
// HoverCard. mountedOpen is true once a lazy popover mounts already open, which
// Mantine doesn't report as an open.
export function useEscapeToClose(mountedOpen) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (mountedOpen) {
      setOpen(true)
    }
  }, [mountedOpen])

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

// useLazyHover holds off mounting a hover popover until the pointer has rested
// on its target for the open delay. A table with a popover in every cell then
// mounts only the few someone looks at, which keeps filtering it quick. Once
// armed, the popover stays mounted and opens like any other.
export function useLazyHover() {
  const [armed, setArmed] = useState(false)
  const timer = useRef(null)

  // Drop a pending timer if the target goes away mid-hover.
  useEffect(() => () => clearTimeout(timer.current), [])

  function arm() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmed(true), HOVER_PROPS.openDelay)
  }
  function disarm() {
    clearTimeout(timer.current)
  }
  return { armed, arm, disarm }
}

// lazyTarget returns the hover target with mouse handlers that arm the lazy
// hover, keeping any mouse handlers the target already had.
export function lazyTarget(child, lazy) {
  if (!child || !child.props) {
    return child
  }
  const { onMouseEnter, onMouseLeave } = child.props
  return cloneElement(child, {
    onMouseEnter: event => {
      lazy.arm()
      if (onMouseEnter) {
        onMouseEnter(event)
      }
    },
    onMouseLeave: event => {
      lazy.disarm()
      if (onMouseLeave) {
        onMouseLeave(event)
      }
    },
  })
}

// HoverInfo shows a small card of extra detail (info, under an optional title)
// while the pointer rests on its child, such as what a column header means or
// the numbers behind a table cell. The child is used as is, so a table cell
// can be the target without breaking the table. lead and badge are optional
// nodes before and after the title, such as mana pips and a game count.
export function HoverInfo({ title, info, width, position = "top", lead, badge, children }) {
  const lazy = useLazyHover()
  const escape = useEscapeToClose(lazy.armed)
  const target = markTarget(children, info)

  // Until the pointer rests here, the target stands alone; armed, the popover
  // mounts already open, since the pointer is on it.
  if (!lazy.armed) {
    return lazyTarget(target, lazy)
  }

  return (
    <HoverCard {...HOVER_PROPS} {...escape} initiallyOpened id={targetId(children)} width={width} position={position} withArrow classNames={popClasses(width, info)}>
      <HoverCard.Target>{target}</HoverCard.Target>
      <HoverCard.Dropdown>
        <PopTitle title={title} lead={lead} badge={badge} />
        <PopBody info={info} />
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

// targetId returns the child's own id as a string, or undefined. Mantine gives
// a hover target the card's id, so each hover passes the child's through:
// sortable headers and clickable cells read it back on click.
export function targetId(child) {
  if (child && child.props && child.props.id) {
    return String(child.props.id)
  }
  return undefined
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
