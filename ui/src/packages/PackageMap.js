// The package page's map: every group once, in two columns, joined by
// curved threads to a pill for each wire that says how many decks filled it.
// Drawn in the Loom's style; the server computes the numbers.

import React, { useLayoutEffect, useRef, useState } from "react"
import { UnstyledButton } from "@mantine/core"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { ruleColor } from "../design/map/ruleColors.js"
import { entryLabel } from "../design/rules/boardModel.js"
import { columnHeadings, decksText, layoutMap, threadWeight } from "./packageMapModel.js"
import "../design/loom.css"
import "./packageMap.css"

// PILL_TIP explains a wire's deck count.
const PILL_TIP = "Decks playing 2+ of the cards in each column of this wire, or 1 where the cube has 3 or fewer."

// chipColor is a group's dot color: its rule color, muted for a card entry,
// or the bad color for a group the rules don't define.
function chipColor(group, groupIndex) {
  if (group.missing) {
    return "var(--se-bad)"
  }
  if (group.card_entry || groupIndex[group.name] === undefined) {
    return "var(--se-muted)"
  }
  return ruleColor(groupIndex[group.name])
}

// ChipFlags are the small marks after a chip's name.
function ChipFlags({ group }) {
  const flags = []
  if (group.missing) {
    flags.push(<span key="missing" className="pm-flag pm-flag-bad">missing</span>)
  }
  if (group.one_card) {
    flags.push(<span key="one" className="pm-flag pm-flag-warn">1 card</span>)
  }
  const others = group.other_packages || []
  if (others.length > 0) {
    let text = "also in " + others[0]
    if (others.length > 1) {
      text += ` +${others.length - 1}`
    }
    flags.push(<span key="also" className="pm-flag">{text}</span>)
  }
  return flags
}

// wiresOf maps each group name to the indexes of the wires that use it.
function wiresOf(map) {
  const out = {}
  map.wires.forEach((wire, index) => {
    for (const name of [...(wire.sources || []), ...(wire.targets || [])]) {
      if (!out[name]) {
        out[name] = []
      }
      out[name].push(index)
    }
  })
  return out
}

// threadPath is a curve from a chip's inner edge to the side of a pill that
// faces the wire's side for this group. A group drawn on the far side of its
// wire gets a curve that loops past the pill to reach that side.
function threadPath(chip, chipSide, pill, wireSide) {
  let x1 = chip.left
  if (chipSide === "left") {
    x1 = chip.right
  }
  const y1 = chip.top + chip.height / 2
  let x2 = pill.right
  let out = 1
  if (wireSide === "left") {
    x2 = pill.left
    out = -1
  }
  const y2 = pill.top + pill.height / 2
  const reach = Math.max(60, Math.abs(x2 - x1) / 2)
  let c1 = x1 - reach
  if (chipSide === "left") {
    c1 = x1 + reach
  }
  const c2 = x2 + out * reach
  return `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`
}

// PackageMap draws map, the "map" block of /stats/package. groupIndex maps a
// group to its rule color index and packageColor colors threads and pills.
// onOpenGroup(name) and onOpenWire(index) run on clicks. With canDrag, a chip
// dropped on a chip in the other column calls onDropWire(leftName, rightName).
export function PackageMap({ map, groupIndex, packageColor, canDrag, onOpenGroup, onOpenWire, onDropWire }) {
  const wrapRef = useRef(null)
  const chipRefs = useRef({})
  const pillRefs = useRef({})
  const [threads, setThreads] = useState([])
  const [hover, setHover] = useState(null)
  const [dragging, setDragging] = useState(null)

  const { left, right } = layoutMap(map)
  const sideOfGroup = {}
  for (const g of left) {
    sideOfGroup[g.name] = "left"
  }
  for (const g of right) {
    sideOfGroup[g.name] = "right"
  }
  const usedBy = wiresOf(map)
  const maxDecks = Math.max(0, ...map.wires.map(w => w.decks))
  const layoutKey = JSON.stringify([left.map(g => g.name), right.map(g => g.name), map.wires.map(w => [w.sources, w.targets])])

  // Measure every chip and pill, then draw one thread per wire entry.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) {
      return undefined
    }
    function measure(el) {
      const wr = wrap.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return { left: r.left - wr.left, right: r.right - wr.left, top: r.top - wr.top, height: r.height }
    }
    function compute() {
      const out = []
      map.wires.forEach((wire, index) => {
        const pillEl = pillRefs.current[index]
        if (!pillEl) {
          return
        }
        const pill = measure(pillEl)
        for (const [wireSide, names] of [["left", wire.sources || []], ["right", wire.targets || []]]) {
          for (const name of names) {
            const chipEl = chipRefs.current[name]
            if (!chipEl) {
              continue
            }
            out.push({ key: index + ":" + wireSide + ":" + name, wire: index, d: threadPath(measure(chipEl), sideOfGroup[name], pill, wireSide) })
          }
        }
      })
      setThreads(out)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [layoutKey])

  // activeWires is the set of wires the pointer is on, or null for all.
  let activeWires = null
  if (hover && hover.kind === "wire") {
    activeWires = [hover.index]
  } else if (hover && hover.kind === "group") {
    activeWires = usedBy[hover.name] || []
  }

  // threadStyle is a thread's width and fade, from its wire's decks and the hover.
  function threadStyle(thread) {
    const wire = map.wires[thread.wire]
    const style = { stroke: packageColor, strokeWidth: threadWeight(wire.decks, maxDecks) }
    let opacity = 0.8
    if (wire.decks <= 1) {
      opacity = 0.35
      style.strokeDasharray = "3 4"
    }
    if (activeWires && !activeWires.includes(thread.wire)) {
      opacity = 0.12
    }
    style.opacity = opacity
    return style
  }

  // chip draws one group in its column, draggable onto the other column.
  function chip(group, side) {
    let className = "de-loom-chip pm-chip"
    if (group.card_entry) {
      className += " pm-chip-card"
    }
    if (dragging && dragging.side !== side) {
      className += " pm-chip-target"
    }
    const dragProps = {}
    if (canDrag) {
      dragProps.draggable = true
      dragProps.onDragStart = e => {
        e.dataTransfer.setData("text/plain", group.name)
        setDragging({ name: group.name, side })
      }
      dragProps.onDragEnd = () => setDragging(null)
      dragProps.onDragOver = e => {
        if (dragging && dragging.side !== side) {
          e.preventDefault()
        }
      }
      dragProps.onDrop = e => {
        e.preventDefault()
        if (!dragging || dragging.side === side) {
          return
        }
        if (side === "right") {
          onDropWire(dragging.name, group.name)
        } else {
          onDropWire(group.name, dragging.name)
        }
        setDragging(null)
      }
    }
    return (
      <UnstyledButton
        key={group.name} className={className}
        ref={el => { if (el) chipRefs.current[group.name] = el; else delete chipRefs.current[group.name] }}
        onClick={() => onOpenGroup(group.name)}
        onMouseEnter={() => setHover({ kind: "group", name: group.name })}
        onMouseLeave={() => setHover(null)}
        {...dragProps}
      >
        <span className="dm-swatch" style={{ background: chipColor(group, groupIndex) }} />
        <span className="de-loom-chip-name">{entryLabel(group.name)}</span>
        {!group.card_entry && <span className="de-loom-chip-sub">{group.cards}</span>}
        <ChipFlags group={group} />
      </UnstyledButton>
    )
  }

  // pill draws one wire's deck count, with a mark for cards on both its sides.
  function pill(wire, index) {
    let className = "pm-pill"
    if (wire.decks <= 1) {
      className += " pm-pill-quiet"
    }
    const selfLinked = wire.self_linked || []
    return (
      <div key={index} className="pm-pill-row">
        <HoverInfo info={PILL_TIP}>
          <UnstyledButton
            className={className} style={{ "--pm-color": packageColor }}
            ref={el => { if (el) pillRefs.current[index] = el; else delete pillRefs.current[index] }}
            onClick={() => onOpenWire(index)}
            onMouseEnter={() => setHover({ kind: "wire", index })}
            onMouseLeave={() => setHover(null)}
          >
            {decksText(wire.decks)}
          </UnstyledButton>
        </HoverInfo>
        {selfLinked.length > 0 && (
          <HoverInfo info={"On both sides of this wire, so they can't link to themselves: " + selfLinked.join(", ")}>
            <span className="pm-flag pm-flag-warn">both sides</span>
          </HoverInfo>
        )}
      </div>
    )
  }

  const headings = columnHeadings(map)

  return (
    <div className="pm-map" ref={wrapRef}>
      <div className="pm-col pm-col-left">
        {headings && <div className="pm-heading">{headings[0]}</div>}
        {left.map(g => chip(g, "left"))}
      </div>
      <div className="pm-pills">{map.wires.map(pill)}</div>
      <div className="pm-col pm-col-right">
        {headings && <div className="pm-heading">{headings[1]}</div>}
        {right.map(g => chip(g, "right"))}
      </div>
      <svg className="de-loom-svg" aria-hidden="true">
        {threads.map(t => <path key={t.key} d={t.d} className="pm-thread" style={threadStyle(t)} />)}
      </svg>
    </div>
  )
}
