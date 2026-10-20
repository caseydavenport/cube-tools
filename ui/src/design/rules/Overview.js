// The Rules editor's resting pane: rulebook totals, coverage, and health.

import React from 'react'
import { UnstyledButton } from '@mantine/core'
import { RichText } from "../../components/kit/RichText.js"
import { RULES_COPY } from "./copy.js"

// Overview is the resting state of the detail pane: rulebook vitals, group
// coverage, and a pointer at anything the audit flagged.
export function Overview({ nodes, groups, links, edges, audit, membershipsLoading, cardGroups, onAudit }) {
  const grouped = membershipsLoading ? null : nodes.filter(n => (cardGroups[n.name] || []).length > 0).length
  const pct = grouped === null || nodes.length === 0 ? 0 : Math.round(100 * grouped / nodes.length)
  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">{RULES_COPY.overview.heading}</h3>
      </div>
      <p className="de-lede"><RichText parts={RULES_COPY.overview.lede} /></p>

      <div className="de-vitals">
        <Vital value={nodes.length} label={RULES_COPY.overview.vitalCards} />
        <Vital value={groups.length} label={RULES_COPY.overview.vitalGroups} />
        <Vital value={links.length} label={RULES_COPY.overview.vitalLinks} />
        <Vital value={edges.length} label={RULES_COPY.overview.vitalEdges} />
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

function Vital({ value, label }) {
  return (
    <div className="de-vital">
      <span className="de-vital-num">{value}</span>
      <span className="de-vital-label">{label}</span>
    </div>
  )
}
