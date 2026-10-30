// A search box over every Magic card, not just the cube's, for finding a
// card's page or comparing against a card outside the cube.

import React, { useEffect, useState } from "react"
import { Autocomplete } from "@mantine/core"

// SEARCH_DELAY_MS is how long typing pauses before the search runs.
const SEARCH_DELAY_MS = 200

// useCardNameSearch fetches the card names matching text, after typing
// pauses. It returns [] for text the server won't search.
function useCardNameSearch(cube, text) {
  const [names, setNames] = useState([])
  useEffect(() => {
    if (text.length < 2) {
      setNames([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetch(`/api/${cube}/cards/search?q=${encodeURIComponent(text)}`)
        .then(r => r.json())
        .then(body => {
          if (!cancelled) {
            setNames(body.names || [])
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNames([])
          }
        })
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cube, text])
  return names
}

// AnyCardSearch is the search box. onPick(name) runs when a name is chosen
// from the list; value seeds the box, and clearing it picks "".
export function AnyCardSearch({ cube, value, onPick, placeholder, className }) {
  const [text, setText] = useState(value || "")
  const names = useCardNameSearch(cube, text)
  useEffect(() => {
    setText(value || "")
  }, [value])

  // onChange tracks the typed text, and clears the pick when the box empties.
  function onChange(typed) {
    setText(typed)
    if (typed === "") {
      onPick("")
    }
  }

  return (
    <Autocomplete
      className={className}
      size="xs"
      data={names}
      filter={({ options }) => options}
      placeholder={placeholder}
      aria-label={placeholder}
      value={text}
      onChange={onChange}
      onOptionSubmit={onPick}
      spellCheck={false}
    />
  )
}
