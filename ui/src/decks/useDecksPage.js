import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LoadCube, LoadDecks } from "../utils/Fetch.js"
import { mergeChangedDecks } from "../utils/RecordEditor.js"
import { isAnonymous } from "../utils/Players.js"
import { addToComparison, comparisonMap, formatCompare, parseCompare } from "../utils/Compare.js"
import { deckRef, sortDecks } from "./deckModel.js"

// FILTER_DELAY_MS is how long the deck filter waits after typing stops before
// it reloads the list, so each keystroke doesn't fetch.
const FILTER_DELAY_MS = 300

// useDebouncedFilter holds the deck filter as typed and the settled value the
// list loads with. The settled value is also passed to onSettled, which keeps
// the app-wide filter (and the URL) in step.
function useDebouncedFilter(initial, onSettled) {
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

// useJson fetches a JSON endpoint once per url, giving fallback until it
// loads or if it fails. The alive flag drops a response that arrives after the
// url changed.
function useJson(url, fallback) {
  const [data, setData] = useState(fallback)

  useEffect(() => {
    let alive = true
    fetch(url)
      .then(resp => resp.json())
      .then(body => {
        if (alive) {
          setData(body)
        }
      })
      .catch(() => {
        if (alive) {
          setData(fallback)
        }
      })
    return () => {
      alive = false
    }
  }, [url])

  return data
}

// buildSynergy turns the design graph's edges into a lookup from each card name
// to the cards it links to, which the text decklist uses for its hover lines.
function buildSynergy(edges) {
  const synergy = new Map()

  function add(from, to, labels) {
    if (!synergy.has(from)) {
      synergy.set(from, [])
    }
    synergy.get(from).push({ other: to, labels: labels || [] })
  }

  for (const edge of edges) {
    add(edge.source, edge.target, edge.rule_labels)
    add(edge.target, edge.source, edge.rule_labels)
  }
  return synergy
}

// filterSuggestions lists the player names, archetypes and tags, and event codes
// in the loaded decks, for the deck filter's autocomplete.
function filterSuggestions(decks) {
  const players = new Set()
  const archetypes = new Set()
  const eventCodes = new Set()

  for (const deck of decks) {
    if (deck.player && !isAnonymous(deck)) {
      players.add(deck.player)
    }
    if (deck.macro_archetype) {
      archetypes.add(deck.macro_archetype)
    }
    for (const label of deck.labels || []) {
      archetypes.add(label)
    }
    if (deck.draft && deck.draft.event_code) {
      eventCodes.add(deck.draft.event_code)
    }
  }

  return {
    playerNames: [...players].sort(),
    archetypes: [...archetypes].sort(),
    eventCodes: [...eventCodes].sort(),
  }
}

// useDeckSelection reads and writes the selected deck (?deck=) and the decks
// being compared (?compare=) in the URL, so both survive a reload and can be
// shared as a link.
function useDeckSelection() {
  const [params, setParams] = useSearchParams()
  const selectedRef = params.get("deck") || ""
  const compareRefs = parseCompare(params.get("compare"))

  // setSelection writes both params in one update, since they change together.
  function setSelection(ref, refs) {
    const next = new URLSearchParams(params)
    if (ref) {
      next.set("deck", ref)
    } else {
      next.delete("deck")
    }

    const compare = formatCompare(refs)
    if (compare) {
      next.set("compare", compare)
    } else {
      next.delete("compare")
    }
    setParams(next, { replace: true })
  }

  // hrefFor is the link to a single deck, keeping the date range and filter.
  function hrefFor(ref) {
    const next = new URLSearchParams(params)
    next.set("deck", ref)
    next.delete("compare")
    return `?${next.toString()}`
  }

  return {
    selectedRef,
    compareRefs,
    select: ref => setSelection(ref, []),
    toggleCompare: ref => {
      const next = addToComparison(compareRefs, selectedRef, ref)
      setSelection(next.highlighted, next.refs)
    },
    clearCompare: () => setSelection(selectedRef, []),
    hrefFor,
  }
}

// useDecksPage loads and holds everything the Decks page shows: the filtered
// deck list in the chosen order, the selection and comparison from the URL, the
// board and view toggles, and the design-map data the decklist views use.
// props are the app-wide date range and filter from App.js.
export function useDecksPage(cube, props) {
  const filter = useDebouncedFilter(props.matchStr, props.onMatchUpdated)
  const selection = useDeckSelection()

  const [sort, setSort] = useState("date")
  const [board, setBoard] = useState("Mainboard")
  const [view, setView] = useState("Text")
  const [decks, setDecks] = useState([])
  const [cubeData, setCubeData] = useState({ cards: [] })

  // The board is part of the request because the filter's card terms match
  // against the chosen board on the server.
  // The alive flag drops a slow response to an older filter, so it can't
  // replace the list for the current one.
  useEffect(() => {
    let alive = true

    function onLoaded(list) {
      if (alive) {
        setDecks([...list])
      }
    }

    LoadDecks(cube, onLoaded, props.startDate, props.endDate, 0, "", filter.settled, board)
    return () => {
      alive = false
    }
  }, [cube, props.startDate, props.endDate, filter.settled, board])

  useEffect(() => {
    LoadCube(cube, setCubeData)
  }, [cube])

  const designGraph = useJson(`/api/${cube}/stats/design-graph`, {})
  const groupDistributions = useJson(`/api/${cube}/stats/group-distributions`, null)

  const synergy = useMemo(() => buildSynergy(designGraph.edges || []), [designGraph])
  const sortedDecks = useMemo(() => sortDecks(decks, sort), [decks, sort])
  const suggestions = useMemo(() => filterSuggestions(decks), [decks])
  const cardNames = useMemo(() => cubeData.cards.map(c => c.name), [cubeData])

  const comparison = useMemo(
    () => comparisonMap(selection.compareRefs, selection.selectedRef, decks, deckRef),
    [selection.compareRefs.join(","), selection.selectedRef, decks],
  )

  // onDecksUpdated merges the decks a save changed into the list. Each is
  // matched by its ref, so a save that finishes after the viewer moved on still
  // lands on the deck it was made for.
  function onDecksUpdated(changed) {
    setDecks(prev => mergeChangedDecks(prev, changed))
  }

  return {
    cube,
    decks,
    sortedDecks,
    sort,
    setSort,
    board,
    setBoard,
    view,
    setView,
    filter,
    selection,
    comparison,
    cardNames,
    ...suggestions,
    synergy,
    designGraph,
    groupDistributions,
    onDecksUpdated,
  }
}
