// The preview of a rule change: how many decks would build each package
// before and after it, without saving. The link check and the group and
// package editors show it.

import React, { useEffect, useState } from "react"
import "./rulesPreview.css"

// usePreview asks the server how proposed, a whole rule set, moves package
// build counts, waiting debounceMs after the last change so typing doesn't
// send a request per keystroke. It returns { changes, failed }: changes is
// null while the answer is on its way, and failed is true when it couldn't
// be had.
export function usePreview(cube, proposed, debounceMs = 500) {
  const [state, setState] = useState({ changes: null, failed: false })
  const body = proposed ? JSON.stringify(proposed) : ""
  useEffect(() => {
    setState({ changes: null, failed: false })
    if (!body) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetch(`/api/${cube}/stats/rules-preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body })
        .then(r => {
          if (!r.ok) {
            throw new Error(r.statusText)
          }
          return r.json()
        })
        .then(resp => {
          if (!cancelled) {
            setState({ changes: resp.packages || [], failed: false })
          }
        })
        .catch(() => {
          if (!cancelled) {
            setState({ changes: null, failed: true })
          }
        })
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cube, body, debounceMs])
  return state
}

// PreviewLine says how the change moves build counts. preview is
// usePreview's answer.
export function PreviewLine({ preview }) {
  if (preview.failed) {
    return <div className="rp-line">Couldn't work out the effect.</div>
  }
  if (preview.changes === null) {
    return <div className="rp-line">Working out the effect…</div>
  }
  if (preview.changes.length === 0) {
    return <div className="rp-line">No package would be built in more or fewer decks.</div>
  }
  return (
    <div className="rp-line">
      {preview.changes.map(c => (
        <span key={c.name} className="rp-item">
          {c.name}: built in <b>{c.now} → {c.after}</b> decks
        </span>
      ))}
    </div>
  )
}
