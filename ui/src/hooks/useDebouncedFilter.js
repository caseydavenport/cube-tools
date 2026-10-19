import { useEffect, useState } from "react"

// FILTER_DELAY_MS is how long the deck filter waits after typing stops before
// it reloads the list, so each keystroke doesn't fetch.
const FILTER_DELAY_MS = 300

// useDebouncedFilter holds the deck filter as typed and the settled value the
// list loads with. The settled value is also passed to onSettled, which keeps
// the app-wide filter (and the URL) in step.
export function useDebouncedFilter(initial, onSettled) {
  const [typed, setTyped] = useState(initial || "")
  const [settled, setSettled] = useState(initial || "")

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(typed)
      if (onSettled) {
        onSettled({ target: { value: typed } })
      }
    }, FILTER_DELAY_MS)

    // Typing again before the delay ends cancels this timer and starts a new one.
    return () => clearTimeout(timer)
  }, [typed])

  return { typed, setTyped, settled }
}
