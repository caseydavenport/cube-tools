import React from "react"
import { Link } from "react-router-dom"
import { Anchor, Text } from "@mantine/core"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { pageHref } from "../shell/paths.js"
import { HOME_BLOCKS, blockState } from "./homeBlocks.js"
import { BlockBody } from "./BlockBody.js"

// PlayerName links a player to their page. Players without an id (as on
// CubeCobra cubes) can't be selected there, so they show as plain text.
function PlayerName({ cube, player }) {
  if (!player.id) {
    return <Text fw={600} size="sm">{player.name}</Text>
  }
  return (
    <Anchor component={Link} to={`${pageHref(cube, "players")}?player=${player.id}`} fw={600} size="sm">
      {player.name}
    </Anchor>
  )
}

// PlayerRow is one ranked player: rank badge, name, deck count, and win rate.
function PlayerRow({ cube, player, rank, copy }) {
  return (
    <div className="home-row">
      <span className={rank === 1 ? "home-rank home-rank-first" : "home-rank"}>{rank}</span>
      <div className="home-row-main">
        <PlayerName cube={cube} player={player} />
      </div>
      <Text className="home-muted-small">{player.decks} {copy.decks}</Text>
      <span className="home-player-rate">{Math.round(player.winPercent)}%</span>
    </div>
  )
}

// TopPlayersCard ranks the players with the best win rates among regulars.
export function TopPlayersCard({ cube, home, info, copy }) {
  return (
    <SectionCard title={copy.topPlayers} linkLabel={copy.playersLink} href={pageHref(cube, "players")}>
      <BlockBody
        state={blockState(HOME_BLOCKS.topPlayers, info)}
        value={home.players}
        error={home.errors.players}
        errorText={copy.error}
        loadingHeight={110}
        render={players => {
          if (players.length === 0) {
            return <EmptyState>{copy.noData}</EmptyState>
          }
          return players.map((p, i) => <PlayerRow key={p.name} cube={cube} player={p} rank={i + 1} copy={copy} />)
        }}
      />
    </SectionCard>
  )
}
