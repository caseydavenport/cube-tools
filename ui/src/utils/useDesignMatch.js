import { useEffect, useRef, useState } from 'react'
import { matchKey } from "./DesignRules.js"

// useDesignMatch fetches the cards matching a design-rules request, each with
// the conditions it hit. It refetches when key changes (by default, the
// request's contents), optionally after a debounce, and ignores responses that
// arrive after a newer request or after unmount. Returns {cards, loading}.
export function useDesignMatch(cube, request, { debounceMs = 0, key } = {}) {
  const [cards, setCards] = useState([])
  // Loading from the first render, so callers don't read an empty result as final.
  const [loading, setLoading] = useState(() => request.conditions.length > 0)
  const seq = useRef(0)
  const effectKey = key ?? matchKey(request, [])

  useEffect(() => {
    const mine = ++seq.current
    if (request.conditions.length === 0) {
      setCards([])
      setLoading(false)
      return
    }
    setLoading(true)
    const run = () => {
      fetch(`/api/${cube}/stats/design-graph/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
        .then(r => r.json())
        .then(d => { if (mine === seq.current) { setCards(d.cards || []); setLoading(false) } })
        .catch(() => { if (mine === seq.current) { setCards([]); setLoading(false) } })
    }
    const timer = debounceMs > 0 ? setTimeout(run, debounceMs) : null
    if (!timer) run()
    return () => {
      if (timer) clearTimeout(timer)
      // Unmount or a newer request makes any in-flight response stale.
      seq.current++
    }
  }, [cube, effectKey])

  return { cards, loading }
}
