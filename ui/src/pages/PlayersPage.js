import React, { useState, useEffect, useMemo } from 'react'
import { useStatsFilters, useStatsData } from "./StatsHooks.js"
import { useSelection } from "../hooks/useSelection.js"
import { BrowseLayout, BrowseEmptyState } from "../components/BrowseLayout.js"
import { PlayerTable, PlayerDetailsPanel } from "./Players.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { Button, DateSelector, NumericInput } from "../components/Dropdown.js"

// PlayersPage is the Browse > Players master-detail page: a roster index on the
// left, the selected player's detail (records vs opponents, by archetype, by
// color, and a win-rate-over-time chart) on the right.
export function PlayersPage(props) {
  const [refresh, setRefresh] = useState(1);

  // Debounced global deck filter, same pattern as StatsViewer.
  const [typingStr, setTypingStr] = useState(props.matchStr || "");
  const [debouncedMatchStr, setDebouncedMatchStr] = useState(props.matchStr || "");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMatchStr(typingStr), 300);
    return () => clearTimeout(t);
  }, [typingStr]);

  const filters = useStatsFilters();
  const dataProps = useMemo(() => ({
    startDate: props.startDate,
    endDate: props.endDate,
    matchStr: debouncedMatchStr,
  }), [props.startDate, props.endDate, debouncedMatchStr]);
  const data = useStatsData(filters, dataProps, refresh);
  const { cube, parsed } = data;

  const [selectedPlayer, setSelectedPlayer] = useSelection("player");

  const {
    playerSortBy, setPlayerSortBy, playerSortInvert, setPlayerSortInvert,
    oppSortBy, setOppSortBy, oppSortInvert, setOppSortInvert,
    playerArchSortBy, setPlayerArchSortBy, playerArchSortInvert, setPlayerArchSortInvert,
    playerColorSortBy, setPlayerColorSortBy, playerColorSortInvert, setPlayerColorSortInvert,
    minGames, setMinGames, bucketSize,
  } = filters;

  const playerNames = useMemo(() => {
    let seen = new Set();
    for (let d of parsed.filteredDecks) if (d.player) seen.add(d.player);
    return Array.from(seen).sort();
  }, [parsed.filteredDecks]);

  // Shared props for both the roster table and the detail panel. Mirrors the
  // wiring StatsViewer used to pass to PlayerWidget.
  const widgetProps = {
    parsed,
    decks: parsed.filteredDecks,
    bucketSize,
    sortBy: playerSortBy,
    invertSort: playerSortInvert,
    onHeaderClick: (e) => {
      if (playerSortBy === e.currentTarget.id) setPlayerSortInvert(!playerSortInvert);
      else { setPlayerSortInvert(false); setPlayerSortBy(e.currentTarget.id); }
    },
    oppSortBy, oppSortInvert,
    onOppHeaderClick: (e) => {
      if (oppSortBy === e.currentTarget.id) setOppSortInvert(!oppSortInvert);
      else { setOppSortInvert(false); setOppSortBy(e.currentTarget.id); }
    },
    playerArchSortBy, playerArchSortInvert,
    onPlayerArchHeaderClick: (e) => {
      if (playerArchSortBy === e.currentTarget.id) setPlayerArchSortInvert(!playerArchSortInvert);
      else { setPlayerArchSortInvert(false); setPlayerArchSortBy(e.currentTarget.id); }
    },
    playerColorSortBy, playerColorSortInvert,
    onPlayerColorHeaderClick: (e) => {
      if (playerColorSortBy === e.currentTarget.id) setPlayerColorSortInvert(!playerColorSortInvert);
      else { setPlayerColorSortInvert(false); setPlayerColorSortBy(e.currentTarget.id); }
    },
    handleRowClick: (e) => setSelectedPlayer(e.currentTarget.id),
    player: selectedPlayer,
    minGames,
    onMinGamesSelected: (e) => setMinGames(e.target.value),
  };

  const filterBar = (
    <>
      <div className="selector-group">
        <Button text="Refresh" onClick={() => setRefresh((r) => r + 1)} />
        <DateSelector label="From" id="from" value={props.startDate} onChange={props.onStartSelected} />
        <DateSelector label="To" id="to" value={props.endDate} onChange={props.onEndSelected} />
        <NumericInput label="Min games" min={0} value={minGames} onChange={(e) => setMinGames(e.target.value)} />
      </div>
      <div className="search-group">
        <PillSearchInput
          label="Filter decks"
          placeholder="Search cards (e.g. color:ug, cmc<3, t:creature)"
          value={typingStr}
          cardNames={cube.cards.map((c) => c.name)}
          playerNames={playerNames}
          onChange={(e) => setTypingStr(e.target.value)}
        />
      </div>
    </>
  );

  return (
    <BrowseLayout
      filters={filterBar}
      index={<PlayerTable {...widgetProps} />}
      detail={
        selectedPlayer
          ? <PlayerDetailsPanel {...widgetProps} />
          : <BrowseEmptyState message="Select a player to see their stats." />
      }
    />
  );
}
