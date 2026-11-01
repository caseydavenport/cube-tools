// Asks the server whether one card is in a group, and which parts of each
// condition it failed. The group dialog uses it for its pinned card.

import { useEffect, useState } from "react"

// useGroupCheck posts body, a group-check request, waiting debounceMs first so
// typing doesn't fire a request per keystroke. It returns null with no body
// or while loading, and { missing: true } for a name the server doesn't know.
export function useGroupCheck(cube, body, debounceMs = 0) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    setResult(null)
    if (!body) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
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
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cube, body, debounceMs])
  return result
}
