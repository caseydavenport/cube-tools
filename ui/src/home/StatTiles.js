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

// HomeTile wraps a StatTile with the block rules every tile shares: the
// missing-data reason, a failed request, loading, and "nothing qualifies yet".
// tileFor turns the loaded value into the tile's value, accent, and detail.
function HomeTile({ label, href, state, value, error, copy, tileFor }) {
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

  const { shown, accent, detail } = tileFor(value)
  return <StatTile label={label} value={shown} accent={accent} detail={detail} href={href} />
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
        tileFor={s => ({ shown: s.drafts, detail: `${s.decks} ${copy.decks} · ${s.players} ${copy.players}` })}
      />

      <HomeTile
        label={copy.archetypeTile}
        href={pageHref(cube, "archetypes")}
        state={blockState(HOME_BLOCKS.archetypeTile, info)}
        value={home.archetype}
        error={errors.archetypes}
        copy={copy}
        tileFor={a => ({
          shown: a.name.charAt(0).toUpperCase() + a.name.slice(1),
          accent: percent(a.winPercent),
          detail: `${percent(a.buildPercent)} ${copy.ofDecks}`,
        })}
      />

      <HomeTile
        label={copy.colorPairTile}
        href={pageHref(cube, "colors")}
        state={blockState(HOME_BLOCKS.colorPairTile, info)}
        value={home.colorPair}
        error={errors.colors}
        copy={copy}
        tileFor={p => ({
          shown: <>{ColorImages(p.identity)}{p.name}</>,
          accent: percent(p.winPercent),
          detail: `${p.decks} ${copy.decks}`,
        })}
      />

      <HomeTile
        label={copy.cardTile}
        href={pageHref(cube, "cards")}
        state={blockState(HOME_BLOCKS.cardTile, info)}
        value={home.card}
        error={errors.cards}
        copy={copy}
        tileFor={c => ({ shown: c.name, accent: `+${c.delta}`, detail: copy.cardDetail })}
      />
    </SimpleGrid>
  )
}
