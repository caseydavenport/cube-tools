import React from "react"
import { SimpleGrid, Skeleton } from "@mantine/core"
import { StatTile } from "../components/kit/StatTile.js"
import { ColorImages } from "../utils/Colors.js"
import { pageHref } from "../shell/paths.js"
import { HOME_BLOCKS, blockState } from "./homeBlocks.js"

// percent formats a win rate or share as a whole-number percentage.
function percent(value) {
  return `${Math.round(value)}%`
}

// capitalize upper-cases a word's first letter: "aggro" becomes "Aggro".
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// Each ...TileText function below turns one tile's loaded value into what the
// tile shows: shown (the big value), accent (the colored note beside it), and
// detail (the small line underneath).

// draftsTileText fills the drafts tile: the draft count, then decks and players.
function draftsTileText(summary, copy) {
  return {
    shown: summary.drafts,
    detail: `${summary.decks} ${copy.decks} · ${summary.players} ${copy.players}`,
  }
}

// archetypeTileText fills the best-archetype tile: its name, win rate, and share
// of decks.
function archetypeTileText(archetype, copy) {
  return {
    shown: capitalize(archetype.name),
    accent: percent(archetype.winPercent),
    detail: `${percent(archetype.buildPercent)} ${copy.ofDecks}`,
  }
}

// colorPairTileText fills the best-color-pair tile: the pair's mana icons and
// guild name, its win rate, and how many decks played it.
function colorPairTileText(pair, copy) {
  const iconsAndName = (
    <>
      {ColorImages(pair.identity)}
      {pair.name}
    </>
  )
  return {
    shown: iconsAndName,
    accent: percent(pair.winPercent),
    detail: `${pair.decks} ${copy.decks}`,
  }
}

// cardTileText fills the hottest-card tile: the card's name and how many points
// its win rate beats its expected win rate by.
function cardTileText(card, copy) {
  return {
    shown: card.name,
    accent: `+${card.delta}`,
    detail: copy.cardDetail,
  }
}

// HomeTile wraps a StatTile with the rules every tile shares, checked in order:
// the missing-data reason, a failed request, loading, and "nothing qualifies
// yet". Only then does tileText turn the value into what the tile shows.
// (BlockBody applies the same order to the larger cards.)
function HomeTile({ label, href, state, value, error, copy, tileText }) {
  if (!state.available) {
    return <StatTile label={label} value="–" detail={state.reason} />
  }
  if (error) {
    return <StatTile label={label} value="–" detail={copy.error} />
  }
  if (value === undefined) {
    return <Skeleton height={86} radius="md" />
  }
  if (value === null) {
    return <StatTile label={label} value="–" detail={copy.noData} href={href} />
  }

  const text = tileText(value, copy)
  return <StatTile label={label} value={text.shown} accent={text.accent} detail={text.detail} href={href} />
}

// StatTiles is the row of four headline tiles: drafts, best archetype, best
// color pair, and the card most over its expected win rate.
export function StatTiles({ cube, home, info, copy }) {
  const errors = home.errors

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
      <HomeTile
        label={copy.draftsTile}
        href={pageHref(cube, "drafts")}
        state={blockState(HOME_BLOCKS.draftsTile, info)}
        value={home.summary}
        error={errors.decks}
        copy={copy}
        tileText={draftsTileText}
      />

      <HomeTile
        label={copy.archetypeTile}
        href={pageHref(cube, "archetypes")}
        state={blockState(HOME_BLOCKS.archetypeTile, info)}
        value={home.archetype}
        error={errors.archetypes}
        copy={copy}
        tileText={archetypeTileText}
      />

      <HomeTile
        label={copy.colorPairTile}
        href={pageHref(cube, "colors")}
        state={blockState(HOME_BLOCKS.colorPairTile, info)}
        value={home.colorPair}
        error={errors.colors}
        copy={copy}
        tileText={colorPairTileText}
      />

      <HomeTile
        label={copy.cardTile}
        href={pageHref(cube, "cards")}
        state={blockState(HOME_BLOCKS.cardTile, info)}
        value={home.card}
        error={errors.cards}
        copy={copy}
        tileText={cardTileText}
      />
    </SimpleGrid>
  )
}
