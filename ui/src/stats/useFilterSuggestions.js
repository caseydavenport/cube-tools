// useFilterSuggestions loads what a page's deck filter autocomplete offers:
// the cube's card names, and the players, archetypes, and event codes in the
// date range's decks.

import { useEffect, useMemo, useState } from "react"
import { filterSuggestions } from "../decks/filterSuggestions.js"
import { fetchJson } from "../utils/fetchJson.js"
import { startLoad } from "./loading.js"

// NO_DECKS and NO_CARDS are the lists before anything loads, shared so they
// don't count as a change on every render.
const NO_DECKS = []
const NO_CARDS = []

// decksUrl lists the cube's decks in the date range. It never sends the deck
// filter, so the suggestions don't shrink as the filter is typed.
function decksUrl(cube, start, end) {
  const params = new URLSearchParams()
  if (start) {
    params.set("start", start)
  }
  if (end) {
    params.set("end", end)
  }
  return `/api/${cube}/decks?${params.toString()}`
}

// useFilterSuggestions returns { decks, suggestions }. decks is the date
// range's unfiltered decks, which a page can also use for its own lists.
// suggestions is { cardNames, playerNames, archetypes, eventCodes }, ready to
// spread into PillSearchInput. A failed load leaves its lists empty, since
// suggestions are only a convenience.
export function useFilterSuggestions(cube, start, end) {
  const [decks, setDecks] = useState(NO_DECKS)
  const [cardNames, setCardNames] = useState(NO_CARDS)

  useEffect(() => {
    function onCube(loaded) {
      setCardNames(loaded.cards.map(card => card.name))
    }
    function onFailure() {
      setCardNames(NO_CARDS)
    }

    // Returning cancel drops the answer if the cube changes before it arrives.
    return startLoad(() => fetchJson(`/api/${cube}/cube`), onCube, onFailure)
  }, [cube])

  useEffect(() => {
    function onDecks(loaded) {
      setDecks(loaded.decks || NO_DECKS)
    }
    function onFailure() {
      setDecks(NO_DECKS)
    }

    // Returning cancel drops the answer if the cube or dates change first.
    return startLoad(() => fetchJson(decksUrl(cube, start, end)), onDecks, onFailure)
  }, [cube, start, end])

  const suggestions = useMemo(() => {
    return { cardNames, ...filterSuggestions(decks) }
  }, [cardNames, decks])

  return { decks, suggestions }
}
