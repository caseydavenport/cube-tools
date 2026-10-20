// The Rules editor pane for one link, drawn as a wiring diagram.

import React, { useState } from 'react'
import { ruleColor } from '../map/ruleColors.js'
import { cardRefName } from '../../utils/DesignRules.js'
import { EditActions } from "./rulesParts.js"
import { Loom } from "./Loom.js"

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
        sub: known ? 'card' : 'missing card',
        onClick: known && onFocusCard ? () => onFocusCard(refName) : undefined,
      }
    }
    return {
      key: name,
      color: groupIndex[name] !== undefined ? ruleColor(groupIndex[name]) : 'var(--danger)',
      label: name,
      sub: groupIndex[name] !== undefined
        ? `${groupCards[name]?.card_count ?? (groupCards[name]?.cards || []).length} cards`
        : 'missing group',
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
        <span className="de-pane-sub">{edgeCount} card edge{edgeCount === 1 ? '' : 's'}</span>
        {canEdit && <EditActions confirming={confirming} setConfirming={setConfirming} onEdit={onEdit} onDelete={onDelete} />}
      </div>
      {warn && <div className="de-warn-note">⚠ {warn}</div>}

      <div className="de-loom-labels"><span>Sources</span><span>Targets</span></div>
      <Loom left={left} right={right} threads={threads} />
      <p className="de-muted de-loom-note">
        Within each wire, every card in a source group links to every card in a target group.
      </p>
    </div>
  )
}
