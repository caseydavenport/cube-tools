// The package page's header band: the name, its groups and cards, and how
// often decks built it, as tiles.

import React from "react"
import { DetailHeader } from "../components/kit/DetailHeader.js"
import { StatTile } from "../components/kit/StatTile.js"
import { GamesWon } from "../cards/CardHeader.js"
import { gamesWonTile } from "../cards/cardPageModel.js"
import { hasData } from "../utils/dataKinds.js"
import { headerTiles, packageSubtitle } from "./packagePageModel.js"

// PackageHeader is the package page's header. info is the cube's info, which
// says whether it records results for the Games won tile.
export function PackageHeader({ page, info }) {
  const tiles = headerTiles(page.stat).map(t => (
    <StatTile key={t.key} label={t.label} value={t.value} detail={t.detail} tip={t.tip} />
  ))
  const won = gamesWonTile(page.stat.record, "the decks that built it")
  if (won && hasData(info, "results")) {
    tiles.push(<GamesWon key="won" tile={won} />)
  }

  const tags = []
  if (page.stat.rarelyTogether) {
    tags.push("Rarely comes together")
  }
  return <DetailHeader title={page.name} subtitle={packageSubtitle(page)} tags={tags} tiles={tiles} />
}
