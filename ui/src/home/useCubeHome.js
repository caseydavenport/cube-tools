import { useEffect, useMemo, useState } from "react"
import { decorateDeck } from "../utils/Fetch.js"
import { personLabel } from "../utils/Players.js"
import {
  countSummary, bestArchetype, bestColorPair, colorWinRates, hottestCard, topPlayers,
} from "./homeStats.js"
import { recentDrafts } from "./recentDrafts.js"

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

// fetchJson fetches a URL and parses its JSON, failing on a non-2xx status.
async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json()
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

// cubeMeta finds this cube's entry (name, description) in the /api/cubes list.
// CubeCobra cubes aren't listed, so they get a stand-in with their id as name.
function cubeMeta(cubesResponse, cube) {
  const listed = (cubesResponse.cubes || []).find(c => c.id === cube)
  if (listed) {
    return listed
  }
  return { id: cube, name: cube.replace(/^cc:/, "") }
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
    meta: undefined,
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

  if (raw.cubes) {
    home.meta = cubeMeta(raw.cubes, cube)
  }
  if (raw.cardList) {
    home.cardCount = (raw.cardList.cards || []).length
  }
  if (decks) {
    home.summary = countSummary(decks, personLabel)
  }
  if (decks && raw.index) {
    // Winners are named by their plain player or seat name ("p6"): each row is
    // already one draft, so personLabel's "(draft N)" suffix would repeat it.
    home.recent = recentDrafts(raw.index, decks, deck => deck.player)
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
