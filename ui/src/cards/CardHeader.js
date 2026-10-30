// The card page's header band: the card's image and name, its play numbers
// as tiles, and its cube history.

import React from "react"
import { DetailHeader } from "../components/kit/DetailHeader.js"
import { StatTile } from "../components/kit/StatTile.js"
import { CardImageURL } from "../utils/Utils.js"
import { hasData } from "../utils/dataKinds.js"
import { HistoryStrip } from "./HistoryStrip.js"
import { cardSubtitle, draftsTile, gamesWonTile, isNewToCube, notInCubeTag, playedTile, popularityLabel, popularityTip } from "./cardPageModel.js"

// headerTags lists the small badges beside the card's name.
function headerTags(page) {
  const tags = []
  if (!page.in_cube) {
    tags.push(notInCubeTag(page.history))
  } else if (isNewToCube(page.history)) {
    tags.push("New to the cube")
  }
  return tags
}

// GamesWon is the "Games won" tile, greyed when the rate can't be told apart
// from a coin flip.
function GamesWon({ tile }) {
  let value = tile.value
  if (tile.muted) {
    value = <span className="kit-win-muted">{tile.value}</span>
  }
  return <StatTile label="Games won" value={value} tip={tile.tip} />
}

// PlayTiles are the header's numbers: decks that played the card, times it
// was sideboarded, drafts it was in the cube for, how popular it is, and its
// games won when the cube records results.
function PlayTiles({ play, history, record, info }) {
  const played = playedTile(play)
  const tiles = [
    <StatTile key="played" label="Drafts played in" value={played.value} detail={played.detail}
      tip={`Drafts where a deck mainboarded it, out of the drafts whose cube had it, in the date range. ${play.mainboard} decks in all.`} />,
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
  const won = gamesWonTile(record)
  if (won && hasData(info, "results")) {
    tiles.push(<GamesWon key="won" tile={won} />)
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
// play numbers, so they show only the image, name and tag. info is the
// cube's info, which says whether it records results.
export function CardHeader({ page, info }) {
  let tiles = null
  if (page.in_cube || page.play.drafts_played > 0) {
    tiles = <PlayTiles play={page.play} history={page.history} record={page.record} info={info} />
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
