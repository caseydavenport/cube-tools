// The Rules editor pane for one group: its conditions, links, and members.

import React, { useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ColorImages } from '../../utils/Colors.js'
import { ruleColor } from '../map/ruleColors.js'
import { EditActions, Emph } from "./rulesParts.js"
import { RULES_COPY } from "./copy.js"

// GroupDetail is the roster review surface: the group's conditions, the links that
// use it, and every member with the condition that pulled it in - hover for the
// card image, so scanning a group for intruders is fast.
export function GroupDetail({
  group, color, members, excluded, cardGroups, nodeByName, linksTouching, linkIndex, warn,
  canEdit, onEdit, onDelete, onExclude, onRestore, onSelectLink, onFocusCard, onHoverCard,
}) {
  const [confirming, setConfirming] = useState(false)
  const memberConds = (name) => (cardGroups[name] || []).find(m => m.group === group.name)?.conds || []
  const otherCount = (name) => Math.max(0, (cardGroups[name] || []).length - 1)
  return (
    <div className="de-pane" style={{ borderTop: `3px solid ${color}` }}>
      <div className="de-pane-head">
        <span className="dm-swatch dm-swatch-lg" style={{ background: color }} />
        <h3 className="de-pane-title">{group.name}</h3>
        <span className="de-pane-sub">
          {RULES_COPY.group.cardCount(members.length)}{excluded.length > 0 && RULES_COPY.group.excludedCount(excluded.length)}
        </span>
        {canEdit && <EditActions confirming={confirming} setConfirming={setConfirming} onEdit={onEdit} onDelete={onDelete} />}
      </div>
      {warn && <div className="de-warn-note">⚠ {warn}</div>}

      <div className="de-subhead">{RULES_COPY.group.matchesAnyOf}</div>
      <div className="de-cond-chips">
        {(group.conditions || []).map((c, i) => <code key={i} className="de-cond">{c}</code>)}
      </div>

      <div className="de-subhead">{RULES_COPY.group.wiredInto(linksTouching.length)}</div>
      {linksTouching.length === 0 && <div className="de-muted">{RULES_COPY.group.noLinks}</div>}
      {linksTouching.map(l => (
        <UnstyledButton key={l.label} className="de-wire" onClick={() => onSelectLink(l.label)}>
          <span className="dm-swatch" style={{ background: ruleColor(linkIndex[l.label] ?? 0) }} />
          <span className="de-wire-label">{l.label}</span>
          <span className="de-wire-ends">
            {(l.wires || []).filter(w => (w.sources || []).includes(group.name) || (w.targets || []).includes(group.name)).map((w, wi) => (
              <span key={wi} className="de-wire-pair">
                {(w.sources || []).map(s => <Emph key={'s' + s} me={group.name} name={s} />)}
                <span className="de-why-arrow">→</span>
                {(w.targets || []).map(t => <Emph key={'t' + t} me={group.name} name={t} />)}
              </span>
            ))}
          </span>
        </UnstyledButton>
      ))}

      <div className="de-subhead">{RULES_COPY.group.membersHeading}</div>
      {members.length === 0 && <div className="de-muted">{RULES_COPY.group.noMembers}</div>}
      <div className="de-roster" onMouseLeave={() => onHoverCard('')}>
        {members.map(name => (
          <UnstyledButton
            key={name} className="de-member"
            onClick={() => onFocusCard(name)}
            onMouseEnter={() => onHoverCard(name)}
            onFocus={() => onHoverCard(name)}
            title={RULES_COPY.group.openInLens}
          >
            <span className="de-pips">{ColorImages(nodeByName[name]?.colors)}</span>
            <span className="de-member-name">{name}</span>
            {otherCount(name) > 0 &&
              <span className="de-member-extra" title={(cardGroups[name] || []).filter(m => m.group !== group.name).map(m => m.group).join(', ')}>
                +{otherCount(name)}
              </span>
            }
            <code className="de-member-cond">{memberConds(name).join(' · ')}</code>
            {canEdit &&
              <span
                className="de-member-x" title={RULES_COPY.group.excludeFromGroup}
                onClick={e => { e.stopPropagation(); onExclude(name) }}
              >×</span>
            }
          </UnstyledButton>
        ))}
      </div>

      {excluded.length > 0 && <>
        <div className="de-subhead">{RULES_COPY.group.excludedHeading(excluded.length)}</div>
        <div className="de-roster" onMouseLeave={() => onHoverCard('')}>
          {excluded.map(name => (
            <UnstyledButton
              key={name} className="de-member de-member-excluded"
              onClick={() => onFocusCard(name)}
              onMouseEnter={() => onHoverCard(name)}
              onFocus={() => onHoverCard(name)}
              title={RULES_COPY.group.openInLens}
            >
              <span className="de-pips">{ColorImages(nodeByName[name]?.colors)}</span>
              <span className="de-member-name">{name}</span>
              <span className="de-excluded-tag">{RULES_COPY.group.excludedTag}</span>
              {canEdit &&
                <span
                  className="de-member-x" title={RULES_COPY.group.restoreToGroup}
                  onClick={e => { e.stopPropagation(); onRestore(name) }}
                >↺</span>
              }
            </UnstyledButton>
          ))}
        </div>
      </>}
    </div>
  )
}
