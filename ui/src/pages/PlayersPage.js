import React, { useEffect, useMemo, useState } from "react"
import { useStatsData, useStatsFilters } from "./StatsHooks.js"
import { useCube } from "../contexts/CubeContext.js"
import { useSelection } from "../hooks/useSelection.js"
import { useArrowNav } from "../hooks/useArrowNav.js"
import { useDebouncedFilter } from "../hooks/useDebouncedFilter.js"
import { useCubeWritable } from "../utils/useCubeWritable.js"
import { fetchPlayers, groupNames, isAnonymous } from "../utils/Players.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PlayersTable } from "../players/PlayersTable.js"
import { sortPlayerRows } from "../players/playerTable.js"
import { PlayerSettings } from "../players/PlayerSettings.js"
import { PlayerProfile } from "../players/PlayerProfile.js"
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

  settings: "List settings",
  minGames: "Min games",
  winConfidence: "Win % confidence",
  sort: "Sort by",
  reverseSort: "Reverse order",
  sortLabels: {
    matches: "Matches",
    name: "Player",
    num_decks: "Drafts",
    games: "Games",
    win_percent: "Bayes Win %",
    trophies: "Trophies",
  },

  renameLabel: "name",
  renameError: "Couldn't rename",

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
  let group = ""
  if (entry) {
    id = entry.id
    group = entry.group || ""
  }

  // select picks a player by name, storing their id in the URL when they have one.
  function select(playerName) {
    setSelected(selectionFor(playerName))
  }

  return { name, id, group, selectionFor, select }
}

// PlayersPage lists the cube's players by matches played, with what each tends
// to draft; a row expands into the player's profile.
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

  const rows = sortPlayerRows(
    [...parsed.playerData.values()].filter(row => row.wins + row.losses >= filters.minGames),
    filters.playerSortBy,
    filters.playerSortInvert,
  )

  // onSort sorts by a column, or reverses it when it's already the sort.
  function onSort(id) {
    const current = filters.playerSortBy || "matches"
    if (id === current) {
      filters.setPlayerSortInvert(!filters.playerSortInvert)
      return
    }
    filters.setPlayerSortBy(id)
    filters.setPlayerSortInvert(false)
  }

  // onToggle opens a player's profile, or closes it when it's already open.
  function onToggle(name) {
    if (name === selection.name) {
      selection.select("")
      return
    }
    selection.select(name)
  }

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

  // renderProfile draws an open row's profile.
  function renderProfile(row) {
    return (
      <PlayerProfile
        row={row}
        cube={cubeId}
        start={props.startDate}
        end={props.endDate}
        decks={parsed.filteredDecks}
        onMatch={props.onLinkMatch}
        playerId={selection.id}
        group={selection.group}
        groups={groupNames(players)}
        editable={editable}
        onRenamed={() => setRefresh(r => r + 1)}
        copy={COPY}
      />
    )
  }

  return (
    <>
      <PageToolbar title={COPY.title} actions={<PlayerSettings filters={filters} copy={COPY} />}>
        <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} />
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

      <div className="players-page">
        <PlayersTable
          rows={rows}
          sortBy={filters.playerSortBy}
          invert={filters.playerSortInvert}
          onSort={onSort}
          confidence={filters.winConfidence}
          expandedName={selection.name}
          onToggle={onToggle}
          renderProfile={renderProfile}
        />
      </div>
    </>
  )
}
