import React, { useState, useEffect, useMemo } from 'react';
import { ColorWidget } from "../stats/colors/ColorWidget.js";
import { ArchetypeWidget } from "../stats/archetypes/ArchetypeWidget.js";
import { DeckWidget } from "../stats/deckstats/DeckWidget.js";
import { CardWidget } from "../stats/cards/CardWidget.js";
import { SynergyWidget } from "../stats/synergy/SynergyWidget.js";
import { HealthWidget } from "./Health.js";
import { DesignMapWidget } from "../design/map/DesignMapWidget.js";
import { useStatsFilters, useStatsData } from "./StatsHooks.js";
import { isAnonymous } from "../utils/Players.js"
import { useCube } from "../contexts/CubeContext.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { StatsToolbar } from "../stats/StatsToolbar.js"
import { StatsSettings } from "../stats/StatsSettings.js"
import { noDecksMatch } from "../stats/statsSummary.js"
import { EmptyState } from "../components/kit/EmptyState.js"

// COPY holds the text the stats pages add around their widgets: page titles,
// the toolbar, and its settings. Placeholders for Casey to replace.
const COPY = {
  titles: {
    cards: "Cards",
    colors: "Colors",
    types: "Archetypes",
    deckstats: "Deck stats",
    synergy: "Synergy",
    health: "Health",
    designmap: "Synergy map",
  },
  filterPlaceholder: "Filter decks",
  refresh: "Refresh",
  settings: "Settings",
  bucketSize: "Bucket size",
  draftSize: "Draft size",
  winConfidence: "Win % confidence",
  drafts: "drafts",
  decks: "decks",
  players: "players",
  colorStats: "Color stats",
  noHealthData: "No health data",
  noMatchingDecks: "No decks match this filter",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",
}

// StatsViewer displays stats spanning the selected drafts. props.view picks
// which page to show; each one sits under the shared stats toolbar and is told
// what data the cube has (info), so it can hide what the cube can't fill.
export function StatsViewer(props) {
  const info = useCubeInfo(useCube());
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
    decks, decksLoaded, cube, archetypeMatchups, cardData, cardDataBucketed,
    synergyData, synergyCompare, colorMatchupData, healthData,
    designGraphData, parsed, graphData, archetypeDropdownOptions,
  } = data;

  // Destructure filter setters for the SelectorBar and Widgets
  const {
    bucketSize,
    manaValue, setManaValue, selectedBucket, setSelectedBucket, colorTypeSelection, setColorTypeSelection,
    colorSortBy, setColorSortBy, colorMode, setColorMode, colorCheckboxes, setColorCheckboxes,
    cardWidgetSelection, setCardWidgetSelection, minDrafts, setMinDrafts, minGames, setMinGames,
    winConfidence, setWinConfidence, significantOnly, setSignificantOnly,
    minPlayers, setMinPlayers, maxPlayers, setMaxPlayers, selectedCard, setSelectedCard,
    cardFilter, setCardFilter, tagFilter, setTagFilter, cardWidgetColorSelection, setCardWidgetColorSelection,
    cardWidgetSortBy, setCardWidgetSortBy, cardWidgetSortInvert, setCardWidgetSortInvert, cardXAxis, setCardXAxis, cardYAxis, setCardYAxis,
    deckXAxis, setDeckXAxis, deckYAxis, setDeckYAxis,
    selectedArchetype, setSelectedArchetype,
    sortBy, setSortBy, minSynergyDecks, setMinSynergyDecks,
    focalThreshold, setFocalThreshold, smoothingK, setSmoothingK,
    colorAdjust, setColorAdjust, synergyRecord, setSynergyRecord, synergySortBy, setSynergySortBy,
  } = filters;

  const playerNames = useMemo(() => {
    let seen = new Set();
    for (let deck of decks) {
      if (deck.player && !isAnonymous(deck)) seen.add(deck.player);
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

  // Only the widget for this page is rendered; the rest of the data stays
  // loaded for when the viewer switches pages.
  let widget = null
  if (props.view === "synergy") {
    widget = (
      <SynergyWidget
        info={info}
        show={true} synergyData={synergyData} synergyCompare={synergyCompare} cube={cube} matchStr={debouncedMatchStr} minSynergyDecks={minSynergyDecks}
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
    )
  } else if (props.view === "colors") {
    widget = (
      <ColorWidget
        info={info}
        copy={COPY}
        parsed={parsed} ddOpts={[{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]}
        colorTypeSelection={colorTypeSelection} onSelected={(e) => setColorTypeSelection(e.target.value)}
        onBucketSelected={(e) => setSelectedBucket(e.target.value)}
        decks={parsed.filteredDecks} onHeaderClick={(e) => setColorSortBy(e.currentTarget.id)}
        colorSortBy={colorSortBy} bucketSize={bucketSize} colorMode={colorMode}
        onColorModeChanged={(e) => setColorMode(e.target.value)}
        selectedBucket={selectedBucket} show={true}
        colorMatchupData={colorMatchupData}
      />
    )
  } else if (props.view === "types") {
    widget = (
      <ArchetypeWidget
        info={info}
        parsed={parsed} cardData={cardData} decks={decks} cube={cube}
        show={true} bucketSize={bucketSize} matchups={archetypeMatchups}
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
    )
  } else if (props.view === "cards") {
    widget = (
      <CardWidget
        info={info}
        parsed={parsed} matchStr={debouncedMatchStr} startDate={props.startDate} endDate={props.endDate}
        cardData={cardData} cardDataBucketed={cardDataBucketed}
        decks={parsed.filteredDecks} dropdownSelection={cardWidgetSelection}
        cardFilter={cardFilter} onCardFilterSelected={(e) => setCardFilter(e.target.value)}
        tagFilter={tagFilter} onTagFilterSelected={(e) => setTagFilter(e.target.value)}
        onSelected={(e) => setCardWidgetSelection(e.target.value)}
        onCardSelected={(e) => setSelectedCard(e.currentTarget.id)}
        selectedCard={selectedCard}
        colorWidgetOpts={[{ label: "", value: "" }, { label: "Red", value: "R" }, { label: "Blue", value: "U" }, { label: "Green", value: "G" }, { label: "Black", value: "B" }, { label: "White", value: "W" }]}
        colorSelection={cardWidgetColorSelection} onColorSelected={(e) => setCardWidgetColorSelection(e.target.value)}
        minDrafts={minDrafts} onMinDraftsSelected={(e) => setMinDrafts(e.target.value)}
        minGames={minGames} onMinGamesSelected={(e) => setMinGames(e.target.value)}
        winConfidence={winConfidence} onWinConfidenceSelected={(e) => setWinConfidence(e.target.value)}
        significantOnly={significantOnly} onSignificantOnlyToggled={(e) => setSignificantOnly(e.target.checked)}
        minPlayers={minPlayers} maxPlayers={maxPlayers} onMinPlayersSelected={(e) => setMinPlayers(e.target.value)}
        onMaxPlayersSelected={(e) => setMaxPlayers(e.target.value)}
        onHeaderClick={(e) => {
          const id = e.currentTarget.id
          if (id === cardWidgetSortBy) {
            setCardWidgetSortInvert(v => !v)
          } else {
            setCardWidgetSortBy(id)
            setCardWidgetSortInvert(false)
          }
        }}
        manaValue={manaValue} onManaValueSelected={(e) => setManaValue(e.target.value)}
        sortBy={cardWidgetSortBy} sortInvert={cardWidgetSortInvert} bucketSize={bucketSize} cube={cube}
        xAxis={cardXAxis} yAxis={cardYAxis} onXAxisSelected={(e) => setCardXAxis(e.target.value)}
        onYAxisSelected={(e) => setCardYAxis(e.target.value)}
        show={true}
        localMatchStr={localMatchStr}
        onLocalMatchUpdated={(e) => setLocalMatchStr(e.target.value)}
        cardNames={cube.cards.map(c => c.name)}
      />
    )
  } else if (props.view === "deckstats") {
    widget = (
      <DeckWidget
        info={info}
        parsed={parsed} graphData={graphData} decks={parsed.filteredDecks} show={true}
        xAxis={deckXAxis} yAxis={deckYAxis} onXAxisSelected={(e) => setDeckXAxis(e.target.value)}
        onYAxisSelected={(e) => setDeckYAxis(e.target.value)}
      />
    )
  } else if (props.view === "health") {
    widget = (
      <HealthWidget
        info={info}
        copy={COPY}
        show={true} healthData={healthData} bucketSize={bucketSize}
      />
    )
  } else if (props.view === "designmap") {
    widget = (
      <DesignMapWidget
        info={info}
        show={true} designGraphData={designGraphData} cards={cube.cards}
        onCardSelected={(e) => setSelectedCard(e.currentTarget.id)}
      />
    )
  }

  // The synergy map is built from the cube list and its rules, not from decks
  // or dates, so its toolbar has only the title.
  if (props.view === "designmap") {
    return (
      <div id="root" className="stats-root">
        <PageToolbar title={COPY.titles.designmap} />
        <div id="widgets" className="house-for-widgets">{widget}</div>
      </div>
    )
  }

  let noMatches = null
  if (noDecksMatch(props.view, decksLoaded, parsed.filteredDecks)) {
    noMatches = <EmptyState>{COPY.noMatchingDecks}</EmptyState>
  }

  return (
    <div id="root" className="stats-root">
      <StatsToolbar
        title={COPY.titles[props.view]}
        props={props}
        filter={typingStr}
        onFilterChange={(e) => setTypingStr(e.target.value)}
        settings={<StatsSettings filters={filters} info={info} copy={COPY} />}
        onRefresh={triggerRefresh}
        decks={parsed.filteredDecks || []}
        filterSuggestions={{ cardNames: cube.cards.map(c => c.name), playerNames, archetypes }}
        copy={COPY}
      />

      <div id="widgets" className="house-for-widgets">
        {noMatches}
        {widget}
      </div>
    </div>
  );
}
