import React, { useState } from "react"
import { Anchor, Badge } from "@mantine/core"

// isProblem says whether a discrepancy is a real error to fix: more copies than
// the cube holds ("over"), or a name that isn't in the cube ("unknown"). A
// "missing" card is only not entered yet.
export function isProblem(discrepancy) {
  return discrepancy.kind === "over" || discrepancy.kind === "unknown"
}

// problemKind is the short label for a problem's kind.
export function problemKind(discrepancy) {
  if (discrepancy.kind === "over") {
    return "Too many"
  }
  return "Not in cube"
}

// problemCount describes how far off a problem's count is.
export function problemCount(discrepancy) {
  if (discrepancy.kind === "over") {
    return `${discrepancy.seen} seen, cube has ${discrepancy.cube}`
  }
  return `${discrepancy.seen} seen`
}

// ProblemRow is the plain row for one problem: its kind, name and count.
function ProblemRow({ discrepancy }) {
  return (
    <li className="import-problem">
      <span className="import-problem-kind">{problemKind(discrepancy)}</span>
      <span className="import-problem-name">{discrepancy.card_name}</span>
      <span className="import-muted">{problemCount(discrepancy)}</span>
    </li>
  )
}

// ConsistencyPanel compares every deck in a draft against the cube list. A
// clean draft holds each cube card at most as often as the cube does, so
// over-counts and unknown names are listed as problems. Cards not entered yet
// fold behind a toggle; hideMissing drops them, for drafts where most of the
// cube is never expected to show up. summary is the line of totals at the top.
// renderProblem, when set, draws each problem row in place of the plain one.
export function ConsistencyPanel({ summary, discrepancies, hideMissing, renderProblem }) {
  const [showMissing, setShowMissing] = useState(false)

  const problems = discrepancies.filter(isProblem)
  const missing = discrepancies.filter((d) => d.kind === "missing")

  let flag = <Badge color="green" variant="light">No problems</Badge>
  if (problems.length > 0) {
    flag = <Badge color="red" variant="light">{problems.length} to check</Badge>
  }

  // problemRow draws one problem, with the caller's row when there is one.
  function problemRow(discrepancy) {
    const key = discrepancy.kind + discrepancy.card_name
    if (renderProblem) {
      return <React.Fragment key={key}>{renderProblem(discrepancy)}</React.Fragment>
    }
    return <ProblemRow key={key} discrepancy={discrepancy} />
  }

  return (
    <section className="kit-card import-consistency">
      <div className="import-consistency-head">
        <span>{summary}</span>
        {flag}
      </div>

      {problems.length > 0 && <ul className="import-problems">{problems.map(problemRow)}</ul>}

      {!hideMissing && missing.length > 0 && (
        <div className="import-missing">
          <Anchor component="button" size="sm" c="dimmed" onClick={() => setShowMissing(!showMissing)}>
            {showMissing ? "Hide" : "Show"} {missing.length} cards not seen yet
          </Anchor>
          {showMissing && (
            <ul className="import-problems">
              {missing.map((d) => (
                <li key={d.card_name} className="import-problem">
                  <span className="import-problem-name">{d.card_name}</span>
                  <span className="import-muted">{d.seen} of {d.cube}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
