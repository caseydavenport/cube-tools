// The Rules editor's card lens: one card's groups and links, and a card search.

import React, { useState, useEffect, useMemo } from 'react'
import { Autocomplete, Button, UnstyledButton } from '@mantine/core'
import { CardImageURL } from '../../utils/Utils.js'
import { ColorImages } from '../../utils/Colors.js'
import { ruleColor } from '../map/ruleColors.js'
import { RULES_COPY } from "./copy.js"

// CardLens is the right rail: pick any card and see its image, which groups hold
// it (and via which condition), and every card it links to, grouped by rule.
export function CardLens({
  names, focal, vs, node, memberships, membershipsLoading, neighbors, groupIndex, linkIndex,
  onPickFocal, onPickVs, onSelectGroup, onSelectLink, onCompare, onHoverCard,
}) {
  // Bucket the neighbors by rule label so linked cards read by-reason.
  const byLabel = useMemo(() => {
    const m = {}
    for (const n of neighbors) {
      for (const l of (n.labels.length ? n.labels : [RULES_COPY.cardLens.unlabeled])) {
        (m[l] = m[l] || []).push(n.name)
      }
    }
    return Object.entries(m)
      .map(([label, cards]) => [label, [...new Set(cards)].sort()])
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [neighbors])

  return (
    <aside className="de-lens">
      <div className="de-lens-media">
        <CardSearch value={focal} onPick={onPickFocal} names={names} placeholder={RULES_COPY.cardLens.searchPlaceholder} />
        {!focal && <div className="de-empty">{RULES_COPY.cardLens.searchPrompt}</div>}
        {focal && <>
          <img className="de-lens-img" src={CardImageURL({ name: focal })} alt={focal} />
          <div className="de-lens-name">
            {node && <span className="de-pips">{ColorImages(node.colors)}</span>}
            {focal}
          </div>
        </>}
      </div>

      {focal && <div className="de-lens-body">
        <div className="de-lens-col">
          <div className="de-subhead">{RULES_COPY.cardLens.inGroups(memberships.length)}</div>
          {membershipsLoading && <div className="de-muted">{RULES_COPY.cardLens.measuring}</div>}
          {!membershipsLoading && memberships.length === 0 && <div className="de-muted">{RULES_COPY.cardLens.notInAnyGroup}</div>}
          {memberships.map(m => (
            <UnstyledButton key={m.group} className="de-lens-group" onClick={() => onSelectGroup(m.group)}
              style={{ boxShadow: `inset 3px 0 0 ${ruleColor(groupIndex[m.group] ?? 0)}` }}>
              <span className="de-lens-group-name">{m.group}</span>
              <code className="de-conds">{(m.conds || []).join(' · ')}</code>
            </UnstyledButton>
          ))}

          <div className="de-subhead">{RULES_COPY.cardLens.compareHeading}</div>
          <CardSearch value={vs} onPick={onPickVs} names={names} placeholder={RULES_COPY.cardLens.comparePlaceholder} />
          {focal && vs && <Button size="xs" variant="default" fullWidth className="de-compare-btn" onClick={onCompare}>{RULES_COPY.cardLens.viewLinksBetween}</Button>}
        </div>

        <div className="de-lens-col de-lens-col-links">
          <div className="de-subhead">{RULES_COPY.cardLens.linkedCards(neighbors.length ? new Set(neighbors.map(n => n.name)).size : 0)}</div>
          {byLabel.length === 0 && <div className="de-muted">{RULES_COPY.cardLens.noLinks}</div>}
          <div className="de-lens-links" onMouseLeave={() => onHoverCard('')}>
            {byLabel.map(([label, cards]) => (
              <div key={label} className="de-lens-rule" style={{ borderLeft: `3px solid ${ruleColor(linkIndex[label] ?? 0)}` }}>
                <UnstyledButton className="de-lens-rule-label" onClick={() => onSelectLink(label)}>{label}</UnstyledButton>
                {cards.map(c => (
                  <UnstyledButton
                    key={c} className="de-lens-linked"
                    onClick={() => onPickVs(c)}
                    onMouseEnter={() => onHoverCard(c)} onFocus={() => onHoverCard(c)}
                    title={RULES_COPY.cardLens.compareWithThisCard}
                  >{c}</UnstyledButton>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>}
    </aside>
  )
}

// CardSearch is a card-name autocomplete. It only commits a pick when the typed
// text exactly matches a known card (so partial typing doesn't write junk to the
// URL); clearing the box clears the selection.
export function CardSearch({ value, onPick, names, placeholder }) {
  const [text, setText] = useState(value || '')
  const nameSet = useMemo(() => new Set(names), [names])
  useEffect(() => { setText(value || '') }, [value])

  function onChange(typed) {
    setText(typed)
    if (typed === '') {
      onPick('')
    } else if (nameSet.has(typed)) {
      onPick(typed)
    }
  }

  return (
    <Autocomplete
      className="de-card-search" size="xs" data={names} limit={20}
      placeholder={placeholder} aria-label={placeholder}
      value={text} onChange={onChange} spellCheck={false}
    />
  )
}
