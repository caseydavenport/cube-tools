// The Rules editor's resting pane: rulebook totals, coverage, and health.

import React from 'react'
import { UnstyledButton } from '@mantine/core'

// Overview is the resting state of the detail pane: rulebook vitals, group
// coverage, and a pointer at anything the audit flagged.
export function Overview({ nodes, groups, links, edges, audit, membershipsLoading, cardGroups, onAudit }) {
  const grouped = membershipsLoading ? null : nodes.filter(n => (cardGroups[n.name] || []).length > 0).length
  const pct = grouped === null || nodes.length === 0 ? 0 : Math.round(100 * grouped / nodes.length)
  return (
    <div className="de-pane">
      <div className="de-pane-head">
        <h3 className="de-pane-title">Design Editor</h3>
      </div>
      <p className="de-lede">
        The rulebook behind the synergy map: <b>groups</b> are card sets defined by query
        conditions, <b>links</b> wire groups together. Pick one on the left, or search a
        card on the right to see where it sits.
      </p>

      <div className="de-vitals">
        <Vital value={nodes.length} label="cards" />
        <Vital value={groups.length} label="groups" />
        <Vital value={links.length} label="links" />
        <Vital value={edges.length} label="card edges" />
      </div>

      <div className="de-subhead">Group coverage</div>
      <div className="de-coverage">
        <div className="de-coverage-bar"><div className="de-coverage-fill" style={{ width: pct + '%' }} /></div>
        <span className="de-coverage-num">
          {grouped === null ? 'measuring…' : `${grouped} of ${nodes.length} cards in at least one group (${pct}%)`}
        </span>
      </div>

      <div className="de-subhead">Health</div>
      {audit.structural === 0 &&
        <div className="de-ok">✓ No structural issues — every group matches cards and is wired to a link.</div>
      }
      {audit.structural > 0 &&
        <UnstyledButton className="de-audit-cta" onClick={onAudit}>
          <span className="de-warn-dot" />
          {audit.structural} structural issue{audit.structural === 1 ? '' : 's'} — open the audit board
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
