import React from "react"
import { SimpleGrid, Stack } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { useCubeHome } from "../home/useCubeHome.js"
import { HomeHeader } from "../home/HomeHeader.js"
import { StatTiles } from "../home/StatTiles.js"
import { RecentDraftsCard } from "../home/RecentDraftsCard.js"
import { ColorWinRatesCard } from "../home/ColorWinRatesCard.js"
import { TopPlayersCard } from "../home/TopPlayersCard.js"
import "../home/home.css"

// COPY holds every piece of text on the cube home, so it can be rewritten in one
// place. These are placeholders.
const COPY = {
  cards: "cards",
  decks: "decks",
  players: "players",
  ofDecks: "of decks",
  draftsTile: "Drafts",
  archetypeTile: "Best archetype",
  colorPairTile: "Best color pair",
  cardTile: "Hottest card",
  cardDetail: "win rate over expected",
  recentDrafts: "Recent drafts",
  allDrafts: "All drafts ›",
  colorWinRates: "Win rate by color",
  colorsLink: "Colors ›",
  topPlayers: "Top players, 5+ decks",
  playersLink: "Players ›",
  seat: "Seat",
  noData: "Nothing to show yet",
  error: "Couldn't load this",
}

// CubeHome is the page at /<cube>: headline stats, recent drafts, win rate by
// color, and top players, each linking to its full page.
export default function CubeHome() {
  const cube = useCube()
  const info = useCubeInfo(cube)
  const home = useCubeHome(cube)

  return (
    <Stack gap="md" className="home-page">
      <HomeHeader meta={home.meta} cardCount={home.cardCount} copy={COPY} />

      <StatTiles cube={cube} home={home} info={info} copy={COPY} />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <RecentDraftsCard cube={cube} home={home} info={info} copy={COPY} />

        <Stack gap="md">
          <ColorWinRatesCard cube={cube} home={home} info={info} copy={COPY} />
          <TopPlayersCard cube={cube} home={home} info={info} copy={COPY} />
        </Stack>
      </SimpleGrid>
    </Stack>
  )
}
