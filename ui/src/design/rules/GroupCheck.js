// "Check a card" for one group: pick any card and see whether it's in the
// group, and if not, which parts of each condition it failed.

import React, { useEffect, useState } from "react"
import { useCube } from "../../contexts/CubeContext.js"
import { AnyCardSearch } from "../../cards/AnyCardSearch.js"
import { checkSummary, failedConditions } from "./groupCheckModel.js"

// useGroupCheck asks the server how card fares against group. It returns
// null with no card or while loading, and { missing: true } for a name the
// server doesn't know.
function useGroupCheck(cube, group, card) {
  const [result, setResult] = useState(null)
  const body = card ? JSON.stringify({ group, card }) : ""
  useEffect(() => {
    setResult(null)
    if (!body) {
      return
    }
    let cancelled = false
    fetch(`/api/${cube}/stats/group-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then(r => {
        if (r.status === 404) {
          return { missing: true }
        }
        return r.json()
      })
      .then(answer => {
        if (!cancelled) {
          setResult(answer)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ missing: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [cube, body])
  return result
}

// FailedCondition is one condition the card didn't match, with each part
// marked passed or failed.
function FailedCondition({ condition }) {
  return (
    <div className="de-check-cond">
      <code className="de-cond">{condition.condition}</code>
      <span className="de-check-parts">
        {condition.parts.map((part, i) => {
          let className = "de-check-part de-check-fail"
          let mark = "✗"
          if (part.matched) {
            className = "de-check-part de-check-pass"
            mark = "✓"
          }
          return <span key={i} className={className}>{mark} {part.text}</span>
        })}
      </span>
    </div>
  )
}

// CheckAnswer shows the server's answer for one card.
function CheckAnswer({ result }) {
  if (result.missing) {
    return <div className="de-muted">That isn't a card the app knows.</div>
  }
  let failed = []
  if (!result.in_group && !result.excluded) {
    failed = failedConditions(result)
  }
  return (
    <div className="de-check-answer">
      <div className="de-check-summary">{checkSummary(result)}</div>
      {failed.map((c, i) => <FailedCondition key={i} condition={c} />)}
    </div>
  )
}

// GroupCheck is the "Check a card" box for group. initialCard, from the
// URL's check param, fills it in when the page opens.
export function GroupCheck({ group, initialCard }) {
  const cube = useCube()
  const [card, setCard] = useState(initialCard || "")
  const result = useGroupCheck(cube, group, card)
  return (
    <div className="de-check">
      <div className="de-subhead">Check a card</div>
      <AnyCardSearch cube={cube} value={card} onPick={setCard} placeholder="Is this card in the group?" className="de-check-search" />
      {result && <CheckAnswer result={result} />}
    </div>
  )
}
