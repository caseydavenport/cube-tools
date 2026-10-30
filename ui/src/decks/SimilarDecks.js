// "Decks like this one": the decks sharing the most cards with the selected
// deck, from any draft, with their records. The server picks and ranks them.

import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { ColorImages } from "../utils/Colors.js"
import { archetypeLabel, deckRef, isDeckInList } from "./deckModel.js"

// useSimilarDecks fetches the decks like the one named by ref, or null while
// they load. A failed fetch reads as no similar decks.
function useSimilarDecks(cube, ref) {
  const [decks, setDecks] = useState(null)

  useEffect(() => {
    let alive = true
    setDecks(null)
    fetch(`/api/${cube}/decks/similar?deck=${encodeURIComponent(ref)}`)
      .then(resp => resp.json())
      .then(body => {
        if (alive) {
          setDecks(body.decks || [])
        }
      })
      .catch(() => {
        if (alive) {
          setDecks([])
        }
      })
    return () => { alive = false }
  }, [cube, ref])

  return decks
}

// recordText is a deck's match record as "2-1", with draws only when it has any.
function recordText(row) {
  if (row.match_draws > 0) {
    return `${row.match_wins}-${row.match_losses}-${row.match_draws}`
  }
  return `${row.match_wins}-${row.match_losses}`
}

// SimilarDeckRow is one similar deck: who played it, its colors, archetype and
// date, how many cards it shares, and its match record. It links to the deck
// only when the current list holds it; one outside the date range or filter
// would open to "not in the current list".
function SimilarDeckRow({ row, decks, hrefFor }) {
  const ref = deckRef({ id: row.id, metadata: { draft_id: row.draft_id } })
  let name = <span>{row.player}</span>
  if (isDeckInList(decks, ref)) {
    name = <Link to={hrefFor(ref)} className="deck-opponent">{row.player}</Link>
  }
  return (
    <div className="deck-match">
      <span className="deck-row-name">
        {name}
        <span className="deck-row-mana">{ColorImages(row.colors)}</span>
        {archetypeLabel(row) && <span className="deck-muted">{archetypeLabel(row)}</span>}
        <span className="deck-muted">{row.date}</span>
      </span>
      <span>
        <span className="deck-muted">{row.shared} cards shared · </span>
        {recordText(row)}
      </span>
    </div>
  )
}

// SimilarDecks is the "Decks like this one" card for the selected deck. decks
// is the loaded list, used to decide which rows can link.
export function SimilarDecks({ cube, deck, decks: loadedDecks, hrefFor }) {
  const decks = useSimilarDecks(cube, deckRef(deck))

  const title = (
    <HoverInfo title="Decks like this one" info="Decks with the most non-basic mainboard cards in common with this one, from any draft.">
      <span>Decks like this one</span>
    </HoverInfo>
  )

  return (
    <SectionCard title={title}>
      {decks !== null && decks.length === 0 && <EmptyState>No other deck shares 8 or more cards.</EmptyState>}
      {(decks || []).map(row => <SimilarDeckRow key={`${row.draft_id}/${row.id}`} row={row} decks={loadedDecks} hrefFor={hrefFor} />)}
    </SectionCard>
  )
}
