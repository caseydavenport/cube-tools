// The Rules editor pane for one link, drawn as a wiring diagram.

import React, { useState } from 'react'
import { ruleColor } from '../map/ruleColors.js'
import { cardRefName } from '../../utils/DesignRules.js'
import { EditActions } from "./rulesParts.js"
import { Loom } from "../Loom.js"
import { RULES_COPY } from "./copy.js"

// LinkDetail shows one link as a wiring diagram: source groups on the left,
// target groups on the right, one thread per declared wire pair.
export function LinkDetail({ link, color, edgeCount, groupIndex, groupCards, warn, canEdit, onEdit, onDelete, onSelectGroup, onFocusCard }) {
  const [confirming, setConfirming] = useState(false)
  const chip = (name) => {
    // A card: ref is a single-card end. Known iff the pseudo-group resolved it.
    const refName = cardRefName(name)
    if (refName) {
      const known = (groupCards[name]?.card_count ?? 0) > 0
      return {
        key: name,
        color: known ? 'var(--text-muted)' : 'var(--danger)',
        label: refName,
        sub: known ? RULES_COPY.link.subCard : RULES_COPY.link.subMissingCard,
        onClick: known && onFocusCard ? () => onFocusCard(refName) : undefined,
      }
    }
    return {
      key: name,
      color: groupIndex[name] !== undefined ? ruleColor(groupIndex[name]) : 'var(--danger)',
      label: name,
      sub: groupIndex[name] !== undefined
        ? RULES_COPY.link.subCardCount(groupCards[name]?.card_count ?? (groupCards[name]?.cards || []).length)
        : RULES_COPY.link.subMissingGroup,
      onClick: groupIndex[name] !== undefined ? () => onSelectGroup(name) : undefined,
    }
  }
  const seenLeft = new Set(), seenRight = new Set(), seenThreads = new Set()
  const left = [], right = [], threads = []
  for (const w of (link.wires || [])) {
    for (const s of (w.sources || [])) if (!seenLeft.has(s)) { seenLeft.add(s); left.push(chip(s)) }
    for (const t of (w.targets || [])) if (!seenRight.has(t)) { seenRight.add(t); right.push(chip(t)) }
    for (const s of (w.sources || [])) {
      for (const t of (w.targets || [])) {
        const key = s + '>' + t
        if (!seenThreads.has(key)) { seenThreads.add(key); threads.push({ from: s, to: t, color, key }) }
      }
    }
  }

  return (
    <div className="de-pane" style={{ borderTop: `3px solid ${color}` }}>
      <div className="de-pane-head">
        <span className="dm-swatch dm-swatch-lg" style={{ background: color }} />
        <h3 className="de-pane-title">{link.label}</h3>
        <span className="de-pane-sub">{RULES_COPY.link.edgeCount(edgeCount)}</span>
        {canEdit && <EditActions confirming={confirming} setConfirming={setConfirming} onEdit={onEdit} onDelete={onDelete} />}
      </div>
      {warn && <div className="de-warn-note">⚠ {warn}</div>}

      <div className="de-loom-labels"><span>{RULES_COPY.link.sources}</span><span>{RULES_COPY.link.targets}</span></div>
      <Loom left={left} right={right} threads={threads} />
      <p className="de-muted de-loom-note">{RULES_COPY.link.note}</p>
    </div>
  )
}
