// The Rules editor's resting pane: rulebook totals, coverage, and health.

import React from 'react'
import { UnstyledButton } from '@mantine/core'
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { RULES_COPY } from "./copy.js"

// GROUPS_TIP and PACKAGES_TIP define the rulebook's two building blocks.
const GROUPS_TIP = "Card sets defined by query conditions. Pick one on the left to see and edit its cards."
const PACKAGES_TIP = "Groups wired together as a synergy: each wire joins source groups to target groups. Pick one on the left, or search a card on the right to see where it sits."

// EDGES_TIP says what the edge count covers, since the card graph elsewhere
// also counts cards cut from the cube.
const EDGES_TIP = "Pairs of cards in the current cube that at least one package joins. Cards cut from the cube keep their edges for old decks, but aren't counted here."

// Overview is the resting state of the detail pane: rulebook vitals, group
// coverage, and a pointer at anything the audit flagged.
export function Overview({ nodes, groups, packages, edges, audit, membershipsLoading, cardGroups, onAudit }) {
  const grouped = membershipsLoading ? null : nodes.filter(n => (cardGroups[n.name] || []).length > 0).length
  const pct = grouped === null || nodes.length === 0 ? 0 : Math.round(100 * grouped / nodes.length)
  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">{RULES_COPY.overview.heading}</h3>
      </div>

      <div className="de-vitals">
        <Vital value={nodes.length} label={RULES_COPY.overview.vitalCards} />
        <Vital value={groups.length} label={RULES_COPY.overview.vitalGroups} tip={GROUPS_TIP} />
        <Vital value={packages.length} label={RULES_COPY.overview.vitalPackages} tip={PACKAGES_TIP} />
        <Vital value={edges.length} label={RULES_COPY.overview.vitalEdges} tip={EDGES_TIP} />
      </div>

      <div className="de-subhead">{RULES_COPY.overview.coverageHeading}</div>
      <div className="de-coverage">
        <div className="de-coverage-bar"><div className="de-coverage-fill" style={{ width: pct + '%' }} /></div>
        <span className="de-coverage-num">
          {grouped === null ? RULES_COPY.overview.coverageMeasuring : RULES_COPY.overview.coverage({ grouped, total: nodes.length, pct })}
        </span>
      </div>

      <div className="de-subhead">{RULES_COPY.overview.healthHeading}</div>
      {audit.structural === 0 &&
        <div className="de-ok">{RULES_COPY.overview.healthOk}</div>
      }
      {audit.structural > 0 &&
        <UnstyledButton className="de-audit-cta" onClick={onAudit}>
          <span className="de-warn-dot" />
          {RULES_COPY.overview.healthIssues(audit.structural)}
        </UnstyledButton>
      }
    </div>
  )
}

// Vital is one big number with its label, and an optional hover tip.
function Vital({ value, label, tip }) {
  const vital = (
    <div className="de-vital">
      <span className="de-vital-num">{value}</span>
      <span className="de-vital-label">{label}</span>
    </div>
  )
  if (!tip) {
    return vital
  }
  return <HoverInfo title={label} info={tip}>{vital}</HoverInfo>
}
