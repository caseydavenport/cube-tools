// The Rules editor's audit board: structural problems, then coverage lists.

import React, { useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ColorImages } from '../../utils/Colors.js'
import { ruleColor } from '../map/ruleColors.js'
import { ChipButton } from "./rulesParts.js"

// AuditBoard is the systematic pass over the rulebook: structural checks first
// (definitionally wrong), then coverage lists (worth a human look). Every item
// jumps straight to the place you'd fix it.
export function AuditBoard({
  audit, membershipsLoading, nodeByName, groupIndex, linkIndex,
  onSelectGroup, onSelectLink, onFocusCard, onHoverCard, onReview,
}) {
  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Audit</h3>
        <span className="de-pane-sub">
          {audit.structural === 0 ? 'no structural issues' : `${audit.structural} structural issue${audit.structural === 1 ? '' : 's'}`}
        </span>
      </div>

      <UnstyledButton className="de-review-cta" onClick={onReview}>
        <span className="de-review-cta-icon">»</span>
        <span>
          <b>Card-by-card review</b> — step through every card with <kbd>←</kbd> <kbd>→</kbd> and check its groups
        </span>
      </UnstyledButton>

      <AuditSection
        title="Empty groups" count={audit.emptyGroups.length}
        blurb="Conditions match no cards — a stale query or a card that left the cube."
        okMsg="Every group matches at least one card."
      >
        {audit.emptyGroups.map(n => (
          <ChipButton key={n} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[n] ?? 0) }} />} onClick={() => onSelectGroup(n)}>
            {n}
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title="Unlinked groups" count={audit.unlinkedGroups.length}
        blurb="No link references these groups, so membership does nothing yet."
        okMsg="Every group is wired into at least one link."
      >
        {audit.unlinkedGroups.map(n => (
          <ChipButton key={n} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[n] ?? 0) }} />} onClick={() => onSelectGroup(n)}>
            {n}
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title="Broken links" count={audit.brokenLinks.length}
        blurb="A wire names a group that doesn't exist, or one side of a wire is empty."
        okMsg="Every wire has valid sources and targets."
      >
        {audit.brokenLinks.map(b => (
          <ChipButton key={b.label} lead={<span className="dm-swatch" style={{ background: ruleColor(linkIndex[b.label] ?? 0) }} />} onClick={() => onSelectLink(b.label)}>
            {b.label}
            <span className="de-chip-sub">{b.missing.length ? `missing: ${b.missing.join(', ')}` : 'empty wire side'}</span>
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title="Stale excludes" count={audit.staleExcludes.length}
        blurb="A group excludes a card name that isn't in the cube — a typo, or a card that was renamed or cut."
        okMsg="Every excluded card name exists in the cube."
      >
        {audit.staleExcludes.map(s => (
          <ChipButton key={s.group + '>' + s.name} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[s.group] ?? 0) }} />} onClick={() => onSelectGroup(s.group)}>
            {s.group}
            <span className="de-chip-sub">excludes: {s.name}</span>
          </ChipButton>
        ))}
      </AuditSection>

      <div className="de-subhead de-audit-divider">Coverage — worth a look, not necessarily wrong</div>

      <AuditSection
        title="Doubled-up links" count={audit.duplicatePairs.length}
        blurb="More than one link wires the same pair of groups — the edges are identical, so one rule may be redundant."
        okMsg="No two links wire the same pair of groups."
      >
        {audit.duplicatePairs.flatMap(d => d.labels.map(label => (
          <ChipButton key={d.key + '>' + label} lead={<span className="dm-swatch" style={{ background: ruleColor(linkIndex[label] ?? 0) }} />} onClick={() => onSelectLink(label)}>
            {label}
            <span className="de-chip-sub">{d.groups[0]} ↔ {d.groups[1]}</span>
          </ChipButton>
        )))}
      </AuditSection>

      <AuditSection
        title="Near-identical groups" count={audit.similarGroups.length}
        blurb="Two groups whose members mostly coincide — likely the same idea captured twice."
        okMsg="No two groups share most of their members."
      >
        {audit.similarGroups.flatMap(s => [s.a, s.b].map(name => (
          <ChipButton key={s.a + '>' + s.b + '>' + name} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[name] ?? 0) }} />} onClick={() => onSelectGroup(name)}>
            {name}
            <span className="de-chip-sub">{s.pct}% same as {name === s.a ? s.b : s.a}</span>
          </ChipButton>
        )))}
      </AuditSection>

      <AuditSection
        title="Ungrouped cards" count={membershipsLoading ? null : audit.ungroupedCards.length}
        blurb="In no group at all — invisible to the synergy map."
        okMsg="Every card is in at least one group."
      >
        {(audit.ungroupedCards || []).map(n => (
          <ChipButton
            key={n} lead={<span className="de-pips">{ColorImages(nodeByName[n]?.colors)}</span>}
            onClick={() => onFocusCard(n)}
            onMouseEnter={() => onHoverCard(n)} onMouseLeave={() => onHoverCard('')}
            onFocus={() => onHoverCard(n)} onBlur={() => onHoverCard('')}
          >
            {n}
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title="Isolated cards" count={membershipsLoading ? null : audit.isolatedCards.length}
        blurb="Grouped, but with zero edges — all of their groups are unlinked."
        okMsg="Every grouped card has at least one edge."
      >
        {(audit.isolatedCards || []).map(n => (
          <ChipButton
            key={n} lead={<span className="de-pips">{ColorImages(nodeByName[n]?.colors)}</span>}
            onClick={() => onFocusCard(n)}
            onMouseEnter={() => onHoverCard(n)} onMouseLeave={() => onHoverCard('')}
            onFocus={() => onHoverCard(n)} onBlur={() => onHoverCard('')}
          >
            {n}
          </ChipButton>
        ))}
      </AuditSection>
    </div>
  )
}

function AuditSection({ title, count, blurb, okMsg, children }) {
  const [open, setOpen] = useState(true)
  const ok = count === 0
  return (
    <section className="de-audit-section">
      <UnstyledButton className="de-audit-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={'de-audit-mark' + (ok ? ' de-audit-ok' : '')}>{ok ? '✓' : count ?? '…'}</span>
        <span className="de-audit-title">{title}</span>
        <span className="de-audit-caret">{open ? '▾' : '▸'}</span>
      </UnstyledButton>
      {open && <>
        <p className="de-audit-blurb">{ok ? okMsg : blurb}</p>
        {count === null && <div className="de-muted">Measuring memberships…</div>}
        {!ok && count !== null && <div className="de-chips">{children}</div>}
      </>}
    </section>
  )
}
