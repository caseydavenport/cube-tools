// Builds the Drafts page's list from the draft index and the slim deck summary:
// every draft in the date range, newest first, with its winner. Pure functions,
// tested in draftList.test.mjs.
import { compareNewestFirst, deckCount, draftName, draftWinner } from "../home/recentDrafts.js"
import { deckRef } from "../decks/deckModel.js"

// inRange reports whether a "YYYY-MM-DD" date falls in the range, ends
// included. Dates in this form sort as text, so plain comparison works.
function inRange(date, start, end) {
  return date >= start && date <= end
}

// firstDeckRef is the ref of a draft's lowest-numbered deck, which the "See
// this draft's decks" link opens, or null when the draft has no decks.
function firstDeckRef(draftDecks) {
  if (draftDecks.length === 0) {
    return null
  }

  let first = draftDecks[0]
  for (const deck of draftDecks) {
    if (deck.id < first.id) {
      first = deck
    }
  }
  return deckRef(first)
}

// draftList returns every draft whose date falls in the range, newest first,
// ready for the list and details: id, label, date, player count, winner,
// whether it has a pick log, and a deck to open from it.
export function draftList(index, summaryDecks, start, end) {
  if (!index || !index.drafts) {
    return []
  }

  const drafts = index.drafts.filter(d => inRange(d.date, start, end))
  drafts.sort(compareNewestFirst)

  return drafts.map(draft => {
    const draftDecks = summaryDecks.filter(d => d.metadata.draft_id === draft.id)
    return {
      id: draft.id,
      label: draftName(draft),
      date: draft.date,
      players: deckCount(draft),
      winner: draftWinner(draftDecks),
      hasLog: Boolean(draft.has_log),
      firstDeckRef: firstDeckRef(draftDecks),
    }
  })
}

// pickLogSection decides what a draft's pick-log area shows: the pack browser
// ("browser") when the draft has a log, a "no pick log" note ("empty") when
// only other drafts in the cube have logs, and nothing ("hidden") when the cube
// has none, as with CubeCobra cubes. A cube not yet known to lack logs counts
// as having them, so the area doesn't flash away while the cube info loads.
export function pickLogSection(cubeHasLogs, draftHasLog) {
  if (draftHasLog) {
    return "browser"
  }
  if (cubeHasLogs === false) {
    return "hidden"
  }
  return "empty"
}
