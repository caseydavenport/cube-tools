// The card page's header band: the card's image and name, its play numbers
// as tiles, and its cube history.

import React from "react"
import { DetailHeader } from "../components/kit/DetailHeader.js"
import { StatTile } from "../components/kit/StatTile.js"
import { CardImageURL } from "../utils/Utils.js"
import { HistoryStrip } from "./HistoryStrip.js"
import { cardSubtitle, draftsTile, isNewToCube, playedTile, popularityLabel, popularityTip } from "./cardPageModel.js"

// headerTags lists the small badges beside the card's name.
function headerTags(page) {
  const tags = []
  if (!page.in_cube) {
    tags.push("Not in the cube")
  } else if (isNewToCube(page.history)) {
    tags.push("New to the cube")
  }
  return tags
}

// PlayTiles are the header's numbers: decks that played the card, times it
// was sideboarded, drafts it was in the cube for, and how popular it is.
function PlayTiles({ play, history }) {
  const played = playedTile(play)
  const tiles = [
    <StatTile key="played" label="Decks that played it" value={played.value} detail={played.detail}
      tip="Decks that mainboarded it, out of the decks from drafts where it was in the cube." />,
    <StatTile key="sideboarded" label="Sideboarded" value={play.sideboard}
      tip="Decks that had it in the sideboard." />,
  ]
  const drafts = draftsTile(history)
  if (drafts) {
    tiles.push(<StatTile key="drafts" label="Drafts in the cube" value={drafts.value} detail={drafts.detail}
      tip="Drafts whose cube list held it or whose decks played it, out of the drafts with a cube list, across all time." />)
  }
  const label = popularityLabel(play.popularity)
  if (label) {
    tiles.push(<StatTile key="popularity" label="Popularity" value={label} tip={popularityTip(play)} />)
  }
  return tiles
}

// everInCube reports whether any draft had the card in its cube or played it.
// A card never in the cube has nothing for the history strip to show.
function everInCube(history) {
  return history.some(cell => cell.state === "played" || cell.state === "in")
}

// ScryfallLink opens the card on Scryfall, for its rulings and printings.
function ScryfallLink({ card }) {
  if (!card.url) {
    return null
  }
  return <a href={card.url} target="_blank" rel="noopener noreferrer" className="card-page-scryfall">Scryfall ↗</a>
}

// CardHeader is the card page's header band. Cards outside the cube have no
// play numbers, so they show only the image, name and tag.
export function CardHeader({ page }) {
  let tiles = null
  if (page.in_cube || page.play.mainboard > 0) {
    tiles = <PlayTiles play={page.play} history={page.history} />
  }
  return (
    <DetailHeader
      image={CardImageURL(page.card)}
      title={page.card.name}
      subtitle={cardSubtitle(page.card)}
      tags={headerTags(page)}
      actions={<ScryfallLink card={page.card} />}
      tiles={tiles}
    >
      {everInCube(page.history) && <HistoryStrip history={page.history} />}
    </DetailHeader>
  )
}
