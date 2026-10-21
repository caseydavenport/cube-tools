import React, { useEffect, useMemo, useState } from "react"
import { useStatsData, useStatsFilters } from "./StatsHooks.js"
import { useCube } from "../contexts/CubeContext.js"
import { PlayerDetailsPanel, playerRowsInOrder } from "./Players.js"
import { useSelection } from "../hooks/useSelection.js"
import { useArrowNav } from "../hooks/useArrowNav.js"
import { useDebouncedFilter } from "../hooks/useDebouncedFilter.js"
import { useCubeWritable } from "../utils/useCubeWritable.js"
import { fetchPlayers, isAnonymous } from "../utils/Players.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { ListDetail } from "../components/kit/ListDetail.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PlayerList } from "../players/PlayerList.js"
import { PlayerSettings } from "../players/PlayerSettings.js"
import { PlayerSummaryCard } from "../players/PlayerSummaryCard.js"
import "../decks/decks.css"
import "../players/players.css"
import { LoadFailedNotice } from "../stats/LoadFailedNotice.js"

// COPY holds every piece of text on the Players page. These are placeholders
// for Casey to replace.
const COPY = {
  title: "Players",
  loadFailed: "Some of this page's data didn't load.",
  retry: "Try again",
  filterPlaceholder: "Filter decks",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",

  settings: "List settings",
  minGames: "Min games",
  sort: "Sort by",
  reverseSort: "Reverse order",
  sortLabels: {
    name: "Player",
    num_decks: "Decks",
    games: "Games",
    win_percent: "Win %",
    trophies: "Trophies",
  },

  playersLower: "players",
  deckLower: "deck",
  decksLower: "decks",
  pickPlayer: "Pick a player from the list",

  games: "games",
  decks: "Decks",
  gamesTile: "Games",
  trophies: "Trophies",
  lastPlace: "Last place",
  opponentWinPercent: "Opponent win %",
  uniqueness: "Uniqueness",
  avgWords: "Avg words",

  renameLabel: "name",
  renameError: "Couldn't rename",

  opponents: "Opponents",
  archetypes: "Archetypes",
  colors: "Colors",
  winRateOverTime: "Win rate over time",

  details: {
    opponentHeader: ({ minGames }) => `Opponent (min ${minGames} games)`,
    winPct: "Win %",
    games: "Games",
    arch: "Arch",
    buildPct: "Build %",
    wins: "Wins",
    losses: "Losses",
    color: "Color",
    // draft: explainers for the player tables' column headers.
    opponentWinPctTip: "Share of the player's games against this opponent that they won.",
    gamesTip: "Number of games the player has played against this opponent.",
    archBuildPctTip: "Share of the player's decks that were this archetype.",
    colorBuildPctTip: "Share of the player's decks that included this color.",
    winPctTip: "Share of the player's games won with these decks.",
    winsTip: "Games the player won with these decks.",
    lossesTip: "Games the player lost with these decks.",
    buildTitle: ({ bucketSize }) => `Build % (bucket size = ${bucketSize} drafts)`,
    winTitle: ({ bucketSize }) => `Win % (buckets size = ${bucketSize} drafts)`,
  },
}

// usePlayerList loads the global player list, again whenever refresh changes
// (after a rename). The page uses it to map between a player's id, which the
// URL carries so links survive renames, and their name, which the stats use.
function usePlayerList(refresh) {
  const [players, setPlayers] = useState([])

  useEffect(() => {
    let alive = true
    fetchPlayers()
      .then(list => {
        if (alive) {
          setPlayers(list)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refresh])

  return players
}

// usePlayerSelection reads the ?player= selection, an id for players in the
// list or a name for those outside it (a CubeCobra cube's), and maps it to a
// name. selectionFor goes the other way, for building row links.
function usePlayerSelection(players) {
  const [selected, setSelected] = useSelection("player")

  const entry = players.find(p => String(p.id) === selected)
  let name = ""
  if (entry) {
    name = entry.name
  } else if (!/^\d+$/.test(selected)) {
    name = selected
  }

  function selectionFor(playerName) {
    const player = players.find(p => p.name === playerName)
    if (player) {
      return String(player.id)
    }
    return playerName
  }

  let id = null
  if (entry) {
    id = entry.id
  }

  // select picks a player by name, storing their id in the URL when they have one.
  function select(playerName) {
    setSelected(selectionFor(playerName))
  }

  return { name, id, selectionFor, select }
}

// detailProps wires the stats tables' sort headers to the shared filter state,
// the way the stats pages pass them to PlayerDetailsPanel.
function detailProps(filters) {
  // headerClick returns a click handler for a table's headers: a new column
  // sorts by it, and clicking the same column again reverses the order.
  function headerClick(sortBy, setSortBy, invert, setInvert) {
    return event => {
      if (sortBy === event.currentTarget.id) {
        setInvert(!invert)
      } else {
        setInvert(false)
        setSortBy(event.currentTarget.id)
      }
    }
  }

  return {
    bucketSize: filters.bucketSize,
    oppSortBy: filters.oppSortBy,
    oppSortInvert: filters.oppSortInvert,
    onOppHeaderClick: headerClick(filters.oppSortBy, filters.setOppSortBy, filters.oppSortInvert, filters.setOppSortInvert),
    playerArchSortBy: filters.playerArchSortBy,
    playerArchSortInvert: filters.playerArchSortInvert,
    onPlayerArchHeaderClick: headerClick(filters.playerArchSortBy, filters.setPlayerArchSortBy, filters.playerArchSortInvert, filters.setPlayerArchSortInvert),
    playerColorSortBy: filters.playerColorSortBy,
    playerColorSortInvert: filters.playerColorSortInvert,
    onPlayerColorHeaderClick: headerClick(filters.playerColorSortBy, filters.setPlayerColorSortBy, filters.playerColorSortInvert, filters.setPlayerColorSortInvert),
  }
}

// PlayersPage lists the cube's players beside the selected player's records.
// The toolbar holds the date range, the deck filter (kept in the URL like on
// Decks), and the list settings. props carry the app-wide dates and filter.
export function PlayersPage(props) {
  const cubeId = useCube()
  const [refresh, setRefresh] = useState(1)
  const filter = useDebouncedFilter(props.matchStr, props.onMatchUpdated)
  const filters = useStatsFilters()

  const dataProps = useMemo(() => ({
    startDate: props.startDate,
    endDate: props.endDate,
    matchStr: filter.settled,
  }), [props.startDate, props.endDate, filter.settled])
  const { cube, parsed, failed } = useStatsData(filters, dataProps, refresh, "players")

  const editable = useCubeWritable(cubeId) === true
  const players = usePlayerList(refresh)
  const selection = usePlayerSelection(players)

  const rows = playerRowsInOrder({
    parsed,
    minGames: filters.minGames,
    sortBy: filters.playerSortBy,
    invertSort: filters.playerSortInvert,
  })

  // The left and right arrow keys step through the list.
  useArrowNav(rows, selection.name, row => row.name, selection.select)

  const playerNames = useMemo(() => {
    const names = new Set()
    for (const deck of parsed.filteredDecks) {
      if (deck.player && !isAnonymous(deck)) {
        names.add(deck.player)
      }
    }
    return [...names].sort()
  }, [parsed.filteredDecks])

  const row = parsed.playerData.get(selection.name)

  let detail = <EmptyState>{COPY.pickPlayer}</EmptyState>
  if (row) {
    const header = (
      <PlayerSummaryCard
        row={row}
        playerId={selection.id}
        editable={editable}
        onRenamed={() => setRefresh(r => r + 1)}
        copy={COPY}
      />
    )
    detail = (
      <PlayerDetailsPanel
        {...detailProps(filters)}
        parsed={parsed}
        decks={parsed.filteredDecks}
        player={selection.name}
        onSelectPlayer={selection.select}
        header={header}
        copy={COPY}
      />
    )
  }

  return (
    <>
      <PageToolbar title={COPY.title} actions={<PlayerSettings filters={filters} copy={COPY} />}>
        <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={COPY} />
        <PillSearchInput
          placeholder={COPY.filterPlaceholder}
          value={filter.typed}
          cardNames={cube.cards.map(c => c.name)}
          playerNames={playerNames}
          onChange={event => filter.setTyped(event.target.value)}
        />
      </PageToolbar>

      <div className="players-notice">
        <LoadFailedNotice failed={failed} onRetry={() => setRefresh(r => r + 1)} copy={COPY} />
      </div>

      <ListDetail
        list={<PlayerList rows={rows} selectedName={selection.name} selectionFor={selection.selectionFor} copy={COPY} />}
        detail={detail}
      />
    </>
  )
}
