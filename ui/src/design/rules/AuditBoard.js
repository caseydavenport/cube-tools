// The Rules editor's audit board: structural problems, then coverage lists.

import React, { useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ColorImages } from '../../utils/Colors.js'
import { ruleColor } from '../map/ruleColors.js'
import { ChipButton } from "./rulesParts.js"
import { RULES_COPY } from "./copy.js"

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
        <h3 className="de-pane-title">{RULES_COPY.audit.heading}</h3>
        <span className="de-pane-sub">
          {audit.structural === 0 ? RULES_COPY.audit.noIssues : RULES_COPY.audit.issues(audit.structural)}
        </span>
      </div>

      <UnstyledButton className="de-review-cta" onClick={onReview}>
        <span className="de-review-cta-icon">»</span>
        <span>
          <b>{RULES_COPY.audit.reviewCtaBold}</b>{RULES_COPY.audit.reviewCtaBefore}<kbd>←</kbd> <kbd>→</kbd>{RULES_COPY.audit.reviewCtaAfter}
        </span>
      </UnstyledButton>

      <AuditSection
        title={RULES_COPY.audit.emptyGroupsTitle} count={audit.emptyGroups.length}
        blurb={RULES_COPY.audit.emptyGroupsBlurb}
        okMsg={RULES_COPY.audit.emptyGroupsOk}
      >
        {audit.emptyGroups.map(n => (
          <ChipButton key={n} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[n] ?? 0) }} />} onClick={() => onSelectGroup(n)}>
            {n}
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title={RULES_COPY.audit.unlinkedGroupsTitle} count={audit.unlinkedGroups.length}
        blurb={RULES_COPY.audit.unlinkedGroupsBlurb}
        okMsg={RULES_COPY.audit.unlinkedGroupsOk}
      >
        {audit.unlinkedGroups.map(n => (
          <ChipButton key={n} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[n] ?? 0) }} />} onClick={() => onSelectGroup(n)}>
            {n}
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title={RULES_COPY.audit.brokenLinksTitle} count={audit.brokenLinks.length}
        blurb={RULES_COPY.audit.brokenLinksBlurb}
        okMsg={RULES_COPY.audit.brokenLinksOk}
      >
        {audit.brokenLinks.map(b => (
          <ChipButton key={b.label} lead={<span className="dm-swatch" style={{ background: ruleColor(linkIndex[b.label] ?? 0) }} />} onClick={() => onSelectLink(b.label)}>
            {b.label}
            <span className="de-chip-sub">{b.missing.length ? RULES_COPY.audit.missingSub(b.missing.join(', ')) : RULES_COPY.audit.emptyWireSide}</span>
          </ChipButton>
        ))}
      </AuditSection>

      <AuditSection
        title={RULES_COPY.audit.staleExcludesTitle} count={audit.staleExcludes.length}
        blurb={RULES_COPY.audit.staleExcludesBlurb}
        okMsg={RULES_COPY.audit.staleExcludesOk}
      >
        {audit.staleExcludes.map(s => (
          <ChipButton key={s.group + '>' + s.name} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[s.group] ?? 0) }} />} onClick={() => onSelectGroup(s.group)}>
            {s.group}
            <span className="de-chip-sub">{RULES_COPY.audit.excludesSub(s.name)}</span>
          </ChipButton>
        ))}
      </AuditSection>

      <div className="de-subhead de-audit-divider">{RULES_COPY.audit.coverageDivider}</div>

      <AuditSection
        title={RULES_COPY.audit.doubledLinksTitle} count={audit.duplicatePairs.length}
        blurb={RULES_COPY.audit.doubledLinksBlurb}
        okMsg={RULES_COPY.audit.doubledLinksOk}
      >
        {audit.duplicatePairs.flatMap(d => d.labels.map(label => (
          <ChipButton key={d.key + '>' + label} lead={<span className="dm-swatch" style={{ background: ruleColor(linkIndex[label] ?? 0) }} />} onClick={() => onSelectLink(label)}>
            {label}
            <span className="de-chip-sub">{d.groups[0]} ↔ {d.groups[1]}</span>
          </ChipButton>
        )))}
      </AuditSection>

      <AuditSection
        title={RULES_COPY.audit.similarGroupsTitle} count={audit.similarGroups.length}
        blurb={RULES_COPY.audit.similarGroupsBlurb}
        okMsg={RULES_COPY.audit.similarGroupsOk}
      >
        {audit.similarGroups.flatMap(s => [s.a, s.b].map(name => (
          <ChipButton key={s.a + '>' + s.b + '>' + name} lead={<span className="dm-swatch" style={{ background: ruleColor(groupIndex[name] ?? 0) }} />} onClick={() => onSelectGroup(name)}>
            {name}
            <span className="de-chip-sub">{RULES_COPY.audit.sameAsSub({ pct: s.pct, other: name === s.a ? s.b : s.a })}</span>
          </ChipButton>
        )))}
      </AuditSection>

      <AuditSection
        title={RULES_COPY.audit.ungroupedCardsTitle} count={membershipsLoading ? null : audit.ungroupedCards.length}
        blurb={RULES_COPY.audit.ungroupedCardsBlurb}
        okMsg={RULES_COPY.audit.ungroupedCardsOk}
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
        title={RULES_COPY.audit.isolatedCardsTitle} count={membershipsLoading ? null : audit.isolatedCards.length}
        blurb={RULES_COPY.audit.isolatedCardsBlurb}
        okMsg={RULES_COPY.audit.isolatedCardsOk}
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
        {count === null && <div className="de-muted">{RULES_COPY.audit.measuring}</div>}
        {!ok && count !== null && <div className="de-chips">{children}</div>}
      </>}
    </section>
  )
}
