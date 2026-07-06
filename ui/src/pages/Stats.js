import React, { useState, useEffect, useMemo } from 'react';
import { ColorWidget } from "./Colors.js";
import { ArchetypeWidget } from "./Types.js";
import { DeckWidget } from "./Decks.js";
import { CardWidget } from "./Cards.js";
import { SynergyWidget } from "./Synergy.js";
import { HealthWidget } from "./Health.js";
import { DesignMapWidget } from "./DesignMap.js";
import { useStatsFilters, useStatsData } from "./StatsHooks.js";
import { SelectorBar } from "../components/StatsUI.js";

// StatsViewer displays stats spanning the selected drafts.
export function StatsViewer(props) {
  const [refresh, setRefresh] = useState(1);
  const triggerRefresh = () => setRefresh(prev => prev + 1);

  // Global deck filter (debounced)
  const [typingStr, setTypingStr] = useState(props.matchStr || "");
  const [debouncedMatchStr, setDebouncedMatchStr] = useState(props.matchStr || "");

  // Local card filter (for specific widgets like Cards)
  const [localMatchStr, setLocalMatchStr] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMatchStr(typingStr);
      if (props.onMatchUpdated) {
        props.onMatchUpdated({ target: { value: typingStr } });
      }
    }, 300); // 300ms debounce delay
    return () => clearTimeout(timer);
  }, [typingStr]);

  // Pass debounced matchStr to the data hook instead of the raw props.
  const debouncedProps = useMemo(() => ({
    ...props,
    matchStr: debouncedMatchStr,
  }), [props.startDate, props.endDate, props.onStartSelected, props.onEndSelected, debouncedMatchStr]);

  const filters = useStatsFilters();
  const data = useStatsData(filters, debouncedProps, refresh);

  const {
    decks, cube, archetypeMatchups, cardData, cardDataBucketed,
    colorData, colorDataBucketed, synergyData, synergyCompare, colorMatchupData, healthData,
    designGraphData, parsed, graphData, archetypeDropdownOptions,
  } = data;

  // Destructure filter setters for the SelectorBar and Widgets
  const {
    bucketSize, setBucketSize, playerMatch, setPlayerMatch, minDraftSize, setMinDraftSize,
    manaValue, setManaValue, selectedBucket, setSelectedBucket, colorTypeSelection, setColorTypeSelection,
    colorSortBy, setColorSortBy, colorMode, setColorMode, colorCheckboxes, setColorCheckboxes,
    cardWidgetSelection, setCardWidgetSelection, minDrafts, setMinDrafts, minGames, setMinGames,
    minPlayers, setMinPlayers, maxPlayers, setMaxPlayers, selectedCard, setSelectedCard,
    cardFilter, setCardFilter, cardWidgetColorSelection, setCardWidgetColorSelection,
    cardWidgetSortBy, setCardWidgetSortBy, cardXAxis, setCardXAxis, cardYAxis, setCardYAxis,
    deckXAxis, setDeckXAxis, deckYAxis, setDeckYAxis,
    playerSortBy, setPlayerSortBy, playerSortInvert, setPlayerSortInvert,
    oppSortBy, setOppSortBy, oppSortInvert, setOppSortInvert,
    playerArchSortBy, setPlayerArchSortBy, playerArchSortInvert, setPlayerArchSortInvert,
    playerColorSortBy, setPlayerColorSortBy, playerColorSortInvert, setPlayerColorSortInvert,
    selectedPlayer, setSelectedPlayer, selectedArchetype, setSelectedArchetype,
    sortBy, setSortBy, minSynergyDecks, setMinSynergyDecks,
    focalThreshold, setFocalThreshold, smoothingK, setSmoothingK,
    colorAdjust, setColorAdjust, synergyRecord, setSynergyRecord, synergySortBy, setSynergySortBy,
  } = filters;

  // Map view prop to display index:
  // colors=0, types=1, cards=2, deckstats=3, drafts=4, players=5, synergy=6, health=7, designmap=8
  const viewIndexMap = {
    colors: 0, types: 1, cards: 2, deckstats: 3,
    drafts: 4, players: 5, synergy: 6, health: 7, designmap: 8,
  };
  const activeIdx = viewIndexMap[props.view] ?? 0;
  const display = Array.from({ length: 9 }, (_, i) => i === activeIdx);

  const playerNames = useMemo(() => {
    let seen = new Set();
    for (let deck of decks) {
      if (deck.player) seen.add(deck.player);
    }
    return Array.from(seen).sort();
  }, [decks]);

  const archetypes = useMemo(() => {
    let seen = new Set();
    for (let deck of decks) {
      if (deck.macro_archetype) seen.add(deck.macro_archetype);
      if (deck.labels) {
        for (let label of deck.labels) {
          seen.add(label);
        }
      }
    }
    return Array.from(seen).sort();
  }, [decks]);

  return (
    <div id="root" className="stats-root">
      {/* The design map is built from the cube list and its rules, not from decks
          or date ranges, so the deck/date filter bar has nothing to act on there. */}
      {props.view !== "designmap" && (
        <SelectorBar
          triggerRefresh={triggerRefresh}
          startDate={props.startDate}
          onStartSelected={props.onStartSelected}
          endDate={props.endDate}
          onEndSelected={props.onEndSelected}
          bucketSize={bucketSize}
          onBucketsChanged={(e) => setBucketSize(Math.max(1, e.target.value))}
          minDraftSize={minDraftSize}
          onMinDraftSizeChanged={(e) => setMinDraftSize(e.target.value)}
          parsed={parsed}
          matchStr={typingStr}
          cardNames={cube.cards.map(c => c.name)}
          playerNames={playerNames}
          archetypes={archetypes}
          onMatchUpdated={(e) => setTypingStr(e.target.value)}
        />
      )}

      <div id="widgets" className="house-for-widgets">
        <SynergyWidget
          show={display[6]} synergyData={synergyData} synergyCompare={synergyCompare} cube={cube} matchStr={debouncedMatchStr} minSynergyDecks={minSynergyDecks}
          onMinSynergyDecksChanged={(e) => setMinSynergyDecks(e.target.value)}
          focalThreshold={focalThreshold}
          onFocalThresholdChanged={(e) => setFocalThreshold(e.target.value)}
          smoothingK={smoothingK}
          onSmoothingKChanged={(e) => setSmoothingK(e.target.value)}
          colorAdjust={colorAdjust}
          onColorAdjustChanged={() => setColorAdjust(!colorAdjust)}
          record={synergyRecord}
          onRecordChanged={(e) => setSynergyRecord(e.target.value)}
          onHeaderClick={(e) => setSynergySortBy(e.currentTarget.id)}
          sortBy={synergySortBy} onCardSelected={(e) => setSelectedCard(e.currentTarget.id)}
        />

        <ColorWidget
          parsed={parsed} ddOpts={[{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]}
          colorTypeSelection={colorTypeSelection} onSelected={(e) => setColorTypeSelection(e.target.value)}
          onBucketSelected={(e) => setSelectedBucket(e.target.value)}
          decks={parsed.filteredDecks} onHeaderClick={(e) => setColorSortBy(e.currentTarget.id)}
          colorSortBy={colorSortBy} bucketSize={bucketSize} colorMode={colorMode}
          onColorModeChanged={(e) => setColorMode(e.target.value)}
          selectedBucket={selectedBucket} show={display[0]}
          colorMatchupData={colorMatchupData}
        />

        <ArchetypeWidget
          parsed={parsed} cardData={cardData} decks={decks} cube={cube}
          show={display[1]} bucketSize={bucketSize} matchups={archetypeMatchups}
          dropdownSelection={colorTypeSelection} onSelected={(e) => setCardWidgetSelection(e.target.value)}
          colorWidgetOpts={[{ label: "", value: "" }, { label: "Red", value: "R" }, { label: "Blue", value: "U" }, { label: "Green", value: "G" }, { label: "Black", value: "B" }, { label: "White", value: "W" }]}
          colorSelection={cardWidgetColorSelection} onColorSelected={(e) => setCardWidgetColorSelection(e.target.value)}
          archetypeDropdownOptions={archetypeDropdownOptions}
          selectedArchetype={selectedArchetype} onArchetypeSelected={(e) => setSelectedArchetype(e.target.value)}
          onColorChecked={(e) => {
            let updated = [...colorCheckboxes];
            const colorMap = { W: 0, U: 1, B: 2, R: 3, G: 4 };
            updated[colorMap[e.currentTarget.id]] = !updated[colorMap[e.currentTarget.id]];
            setColorCheckboxes(updated);
          }}
          colorCheckboxes={colorCheckboxes} onMinDraftsSelected={(e) => setMinDrafts(e.target.value)}
          minDrafts={minDrafts} onMinGamesSelected={(e) => setMinGames(e.target.value)}
          minDecksInArch={minGames} sortBy={sortBy} onHeaderClick={(e) => setSortBy(e.currentTarget.id)}
          handleRowClick={(e) => setSelectedArchetype(e.currentTarget.id)}
        />

        <CardWidget
          parsed={parsed} matchStr={debouncedMatchStr} cardData={cardData} cardDataBucketed={cardDataBucketed}
          decks={parsed.filteredDecks} dropdownSelection={cardWidgetSelection}
          cardFilter={cardFilter} onCardFilterSelected={(e) => setCardFilter(e.target.value)}
          cardWidgetOpts={[{ label: "Mainboard rate", value: "Mainboard rate" }, { label: "Win rate", value: "Win rate" }, { label: "Versus archetype", value: "Versus archetype" }, { label: "By archetype", value: "By archetype" }]}
          onSelected={(e) => setCardWidgetSelection(e.target.value)}
          onCardSelected={(e) => setSelectedCard(e.currentTarget.id)}
          selectedCard={selectedCard}
          colorWidgetOpts={[{ label: "", value: "" }, { label: "Red", value: "R" }, { label: "Blue", value: "U" }, { label: "Green", value: "G" }, { label: "Black", value: "B" }, { label: "White", value: "W" }]}
          colorSelection={cardWidgetColorSelection} onColorSelected={(e) => setCardWidgetColorSelection(e.target.value)}
          minDrafts={minDrafts} onMinDraftsSelected={(e) => setMinDrafts(e.target.value)}
          minGames={minGames} onMinGamesSelected={(e) => setMinGames(e.target.value)}
          minPlayers={minPlayers} maxPlayers={maxPlayers} onMinPlayersSelected={(e) => setMinPlayers(e.target.value)}
          onMaxPlayersSelected={(e) => setMaxPlayers(e.target.value)}
          onHeaderClick={(e) => setCardWidgetSortBy(e.currentTarget.id)}
          manaValue={manaValue} onManaValueSelected={(e) => setManaValue(e.target.value)}
          sortBy={cardWidgetSortBy} bucketSize={bucketSize} cube={cube}
          xAxis={cardXAxis} yAxis={cardYAxis} onXAxisSelected={(e) => setCardXAxis(e.target.value)}
          onYAxisSelected={(e) => setCardYAxis(e.target.value)}
          show={display[2]}
          localMatchStr={localMatchStr}
          onLocalMatchUpdated={(e) => setLocalMatchStr(e.target.value)}
          cardNames={cube.cards.map(c => c.name)}
        />

        <DeckWidget
          parsed={parsed} graphData={graphData} decks={parsed.filteredDecks} show={display[3]}
          xAxis={deckXAxis} yAxis={deckYAxis} onXAxisSelected={(e) => setDeckXAxis(e.target.value)}
          onYAxisSelected={(e) => setDeckYAxis(e.target.value)}
        />

        <HealthWidget
          show={display[7]} healthData={healthData} bucketSize={bucketSize}
        />
        <DesignMapWidget
          show={display[8]} designGraphData={designGraphData} cards={cube.cards}
          onCardSelected={(e) => setSelectedCard(e.currentTarget.id)}
          onRulesChanged={triggerRefresh}
        />
      </div>
    </div>
  );
}
