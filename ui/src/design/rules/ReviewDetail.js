// The Rules editor's card-by-card review, stepped with the arrow keys.

import React, { useEffect, useMemo } from 'react'
import { Button, UnstyledButton } from '@mantine/core'
import { CardImageURL } from '../../utils/Utils.js'
import { ColorImages } from '../../utils/Colors.js'
import { ruleColor } from '../map/ruleColors.js'
import { CardSearch } from "./CardLens.js"
import { ChipButton } from "./rulesParts.js"

// ReviewDetail steps through every card in the cube, one per screen, so a full
// membership pass is just holding the right-arrow key. Position rides in the
// card URL param, so a half-finished pass resumes from wherever you left off.
export function ReviewDetail({
  names, card, node, memberships, membershipsLoading, neighbors,
  groupIndex, linkIndex, keysEnabled, onGo, onSelectGroup, onSelectLink,
}) {
  const idx = names.indexOf(card)
  const go = (delta) => {
    const next = names[Math.min(names.length - 1, Math.max(0, idx + delta))]
    if (next && next !== card) onGo(next)
  }

  useEffect(() => {
    if (!keysEnabled) return
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // label -> distinct linked-card count, so the link summary reads by-reason.
  const ruleCounts = useMemo(() => {
    const m = {}
    for (const n of neighbors) {
      for (const l of (n.labels.length ? n.labels : ['(unlabeled)'])) {
        (m[l] = m[l] || new Set()).add(n.name)
      }
    }
    return Object.entries(m).map(([label, s]) => [label, s.size]).sort((a, b) => a[0].localeCompare(b[0]))
  }, [neighbors])

  const ungrouped = !membershipsLoading && memberships.length === 0
  const isolated = !ungrouped && !membershipsLoading && neighbors.length === 0

  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Review</h3>
        <span className="de-pane-sub">{idx + 1} of {names.length}</span>
        <span className="de-pane-actions">
          <span className="de-review-jump">
            <CardSearch key={card} value="" onPick={(n) => n && onGo(n)} names={names} placeholder="Jump to card…" />
          </span>
          <Button size="xs" variant="default" onClick={() => go(-1)} disabled={idx === 0}>← Prev</Button>
          <Button size="xs" variant="default" onClick={() => go(1)} disabled={idx === names.length - 1}>Next →</Button>
        </span>
      </div>
      <div className="de-review-progress">
        <div className="de-review-progress-fill" style={{ width: (100 * (idx + 1) / names.length) + '%' }} />
      </div>

      <div className="de-review">
        <img className="de-review-img" src={CardImageURL({ name: card })} alt={card} />
        <div className="de-review-info">
          <div className="de-lens-name">
            {node && <span className="de-pips">{ColorImages(node.colors)}</span>}
            {card}
          </div>
          {ungrouped && <div className="de-warn-note">⚠ In no groups — invisible to the synergy map.</div>}
          {isolated && <div className="de-warn-note">⚠ Grouped, but no edges — all of its groups are unlinked.</div>}

          <div className="de-subhead">In groups {memberships.length ? `(${memberships.length})` : ''}</div>
          {membershipsLoading && <div className="de-muted">Measuring…</div>}
          {memberships.map(m => (
            <UnstyledButton key={m.group} className="de-review-group" onClick={() => onSelectGroup(m.group)}
              style={{ boxShadow: `inset 3px 0 0 ${ruleColor(groupIndex[m.group] ?? 0)}` }}>
              <span className="de-review-group-name">{m.group}</span>
              <code className="de-conds">{(m.conds || []).join(' · ')}</code>
            </UnstyledButton>
          ))}

          <div className="de-subhead">Linked cards {neighbors.length ? `(${new Set(neighbors.map(n => n.name)).size})` : ''}</div>
          {!membershipsLoading && ruleCounts.length === 0 && !ungrouped && <div className="de-muted">No links from this card.</div>}
          <div className="de-chips de-review-rules">
            {ruleCounts.map(([label, count]) => (
              <ChipButton key={label} lead={<span className="dm-swatch" style={{ background: ruleColor(linkIndex[label] ?? 0) }} />} onClick={() => onSelectLink(label)}>
                {label}
                <span className="de-chip-count">{count}</span>
              </ChipButton>
            ))}
          </div>
        </div>
      </div>

      <div className="de-review-hint">
        <kbd>←</kbd> previous · <kbd>→</kbd> next — position is saved in the URL, come back anytime.
      </div>
    </div>
  )
}
