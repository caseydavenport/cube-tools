import { useEffect, useMemo, useState } from "react"
import { decorateDeck } from "../utils/Fetch.js"
import { personLabel } from "../utils/Players.js"
import {
  countSummary, bestArchetype, bestColorPair, colorWinRates, hottestCard, topPlayers,
} from "./homeStats.js"
import { recentDrafts } from "./recentDrafts.js"
import { cubeMeta } from "./cubeMeta.js"
import { fetchJson } from "../utils/fetchJson.js"

// sourcesFor lists every request the cube home makes, by name. No dates are
// sent, which the server treats as all time.
function sourcesFor(cube) {
  return {
    cubes: "/api/cubes",
    cardList: `/api/${cube}/cube`,
    index: `/api/${cube}/index`,
    decks: `/api/${cube}/decks`,
    archetypes: `/api/${cube}/stats/archetypes`,
    colors: `/api/${cube}/stats/colors`,
    cards: `/api/${cube}/stats/cards?min_games=20`,
    players: `/api/${cube}/stats/players`,
  }
}

// emptyState is the state for a cube whose requests haven't answered yet.
function emptyState(cube) {
  return { cube, raw: {}, errors: {} }
}

// useCubeResponses starts all of the cube home's requests together and records
// each response (or error) as it arrives, under its source name.
function useCubeResponses(cube) {
  const [state, setState] = useState(() => emptyState(cube))

  useEffect(() => {
    setState(emptyState(cube))

    // If the viewer switches cubes, the cleanup below marks these requests
    // stale, so a late answer can't land on the new cube's page.
    let stale = false

    for (const [name, url] of Object.entries(sourcesFor(cube))) {
      fetchJson(url)
        .then(data => {
          if (!stale) {
            setState(prev => ({ ...prev, raw: { ...prev.raw, [name]: data } }))
          }
        })
        .catch(err => {
          if (!stale) {
            setState(prev => ({ ...prev, errors: { ...prev.errors, [name]: String(err.message || err) } }))
          }
        })
    }

    return () => {
      stale = true
    }
  }, [cube])

  // Until the reset above runs, the state still belongs to the previous cube,
  // so treat it as empty rather than showing that cube's numbers.
  if (state.cube !== cube) {
    return emptyState(cube)
  }
  return state
}

// useCubeHome loads everything the cube home shows. Each field is undefined
// while its requests are still loading, then holds the selector's result.
// errors maps a source name to a short message when its request failed.
export function useCubeHome(cube) {
  const { raw, errors } = useCubeResponses(cube)

  // The server's decks need client-side decoration (colors, averages) before
  // the selectors read them. Memoized so it runs once per decks response.
  const decks = useMemo(() => {
    if (!raw.decks) {
      return undefined
    }
    return (raw.decks.decks || []).map(decorateDeck)
  }, [raw.decks])

  const home = {
    meta: cubeMeta(raw.cubes, errors.cubes, cube),
    cardCount: undefined,
    summary: undefined,
    archetype: undefined,
    colorPair: undefined,
    card: undefined,
    recent: undefined,
    colorRates: undefined,
    players: undefined,
    errors,
  }

  if (raw.cardList) {
    home.cardCount = (raw.cardList.cards || []).length
  }
  if (decks) {
    home.summary = countSummary(decks, personLabel)
  }
  if (decks && raw.index) {
    home.recent = recentDrafts(raw.index, decks)
  }
  if (raw.archetypes) {
    home.archetype = bestArchetype(raw.archetypes)
  }
  if (raw.colors) {
    home.colorPair = bestColorPair(raw.colors)
    home.colorRates = colorWinRates(raw.colors)
  }
  if (raw.cards) {
    home.card = hottestCard(raw.cards)
  }
  if (raw.players) {
    home.players = topPlayers(raw.players)
  }

  return home
}
