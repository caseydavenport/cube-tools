// The Rules editor pane comparing two cards: the links between them and why.

import React from 'react'
import { Button, UnstyledButton } from '@mantine/core'
import { CardImageURL } from '../../utils/Utils.js'
import { ColorImages } from '../../utils/Colors.js'
import { ruleColor } from '../map/ruleColors.js'
import { cardRefName } from '../../utils/DesignRules.js'
import { Loom } from "./Loom.js"

// CompareDetail traces the links between two specific cards: the two card images
// flank a loom of the group-to-group bridges that connect them, colored by rule.
export function CompareDetail({
  focal, vs, between, nodeByName, cardGroups, groupIndex, linkIndex,
  canEdit, onSelectGroup, onSelectLink, onEditLink, onSwap, onClear,
}) {
  const chipFor = (name) => {
    // Direct card: refs render as the card name, with no group to select.
    const refName = cardRefName(name)
    if (refName) return { key: name, color: 'var(--text-muted)', label: refName }
    return {
      key: name, color: ruleColor(groupIndex[name] ?? 0), label: name,
      onClick: () => onSelectGroup(name),
    }
  }
  const leftSeen = new Set(), rightSeen = new Set()
  const left = [], right = [], threads = []
  for (const r of between) {
    const c = ruleColor(linkIndex[r.label] ?? 0)
    for (const b of r.bridges) {
      if (!leftSeen.has(b.focusGroup)) { leftSeen.add(b.focusGroup); left.push(chipFor(b.focusGroup)) }
      if (!rightSeen.has(b.neighGroup)) { rightSeen.add(b.neighGroup); right.push(chipFor(b.neighGroup)) }
      threads.push({ from: b.focusGroup, to: b.neighGroup, color: c, key: r.label + ':' + b.focusGroup + '>' + b.neighGroup })
    }
  }

  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Compare</h3>
        <span className="de-pane-sub">{between.length} link{between.length === 1 ? '' : 's'} between</span>
        <span className="de-pane-actions">
          <Button size="xs" variant="default" onClick={onSwap}>⇄ Swap</Button>
          <Button size="xs" variant="default" onClick={onClear}>Clear</Button>
        </span>
      </div>

      <div className="de-compare">
        <figure className="de-compare-card">
          <img src={CardImageURL({ name: focal })} alt={focal} />
          <figcaption>{nodeByName[focal] && <span className="de-pips">{ColorImages(nodeByName[focal].colors)}</span>}{focal}</figcaption>
        </figure>
        <div className="de-compare-mid">
          {between.length === 0 && <div className="de-empty">No links between these two cards.</div>}
          {between.length > 0 && <Loom left={left} right={right} threads={threads} />}
        </div>
        <figure className="de-compare-card">
          <img src={CardImageURL({ name: vs })} alt={vs} />
          <figcaption>{nodeByName[vs] && <span className="de-pips">{ColorImages(nodeByName[vs].colors)}</span>}{vs}</figcaption>
        </figure>
      </div>

      {between.map(r => (
        <div key={r.label} className="de-linkgroup">
          <UnstyledButton className="de-wire" onClick={() => onSelectLink(r.label)}>
            <span className="dm-swatch" style={{ background: ruleColor(linkIndex[r.label] ?? 0) }} />
            <span className="de-wire-label">{r.label}</span>
            {canEdit &&
              <span className="de-edit-hint" onClick={e => { e.stopPropagation(); onEditLink(r.label) }}>edit ▸</span>
            }
          </UnstyledButton>
          {r.bridges.map((b, i) => (
            <div key={i} className="de-why">
              <span className="de-why-group">{cardRefName(b.focusGroup) ? <em>direct</em> : b.focusGroup}</span>
              {b.focusConds.length > 0 && <code className="de-why-cond">{b.focusConds.join(' · ')}</code>}
              <span className="de-why-arrow">→</span>
              <span className="de-why-group">{cardRefName(b.neighGroup) ? <em>direct</em> : b.neighGroup}</span>
              {b.neighConds.length > 0 && <code className="de-why-cond">{b.neighConds.join(' · ')}</code>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
