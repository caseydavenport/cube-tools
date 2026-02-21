import React, { useState, useEffect, useMemo } from 'react';
import { ColorWidget } from "./Colors.js";
import { ArchetypeWidget } from "./Types.js";
import { DeckWidget } from "./Decks.js";
import { PlayerWidget } from "./Players.js";
import { CardWidget } from "./Cards.js";
import { SynergyWidget } from "./Synergy.js";
import { DraftWidget } from "./Drafts.js";
import { useStatsFilters, useStatsData } from "./StatsHooks.js";
import { SelectorBar } from "../components/StatsUI.js";

// StatsViewer displays stats spanning the selected drafts.
export function StatsViewer(props) {
  const [refresh, setRefresh] = useState(1);
  const triggerRefresh = () => setRefresh(prev => prev + 1);

  // Debounce search input so expensive recomputation doesn't run on every keystroke.
  const [typingStr, setTypingStr] = useState(props.matchStr || "");
  const [debouncedMatchStr, setDebouncedMatchStr] = useState(props.matchStr || "");

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
    decks, cube, drafts, archetypeMatchups, cardData, cardDataBucketed,
    colorData, colorDataBucketed, synergyData, parsed, graphData,
    archetypeDropdownOptions, draftLogs
  } = data;

  // Destructure filter setters for the SelectorBar and Widgets
  const {
    bucketSize, setBucketSize, playerMatch, setPlayerMatch, minDraftSize, setMinDraftSize,
    manaValue, setManaValue, selectedBucket, setSelectedBucket, colorTypeSelection, setColorTypeSelection,
    colorSortBy, setColorSortBy, strictColors, setStrictColors, colorCheckboxes, setColorCheckboxes,
    cardWidgetSelection, setCardWidgetSelection, minDrafts, setMinDrafts, minGames, setMinGames,
    minPlayers, setMinPlayers, maxPlayers, setMaxPlayers, selectedCard, setSelectedCard,
    cardFilter, setCardFilter, cardWidgetColorSelection, setCardWidgetColorSelection,
    cardWidgetSortBy, setCardWidgetSortBy, xAxis, setXAxis, yAxis, setYAxis,
    draftSortBy, setDraftSortBy, draftSortInvert, setDraftSortInvert,
    minDeviation, setMinDeviation, maxDeviation, setMaxDeviation,
    minAvgPick, setMinAvgPick, maxAvgPick, setMaxAvgPick,
    selectedDraftLog, setSelectedDraftLog, selectedDraftPlayer, setSelectedDraftPlayer,
    draftPlayers, setDraftPlayers, draftPacks, setDraftPacks, selectedPack, setSelectedPack,
    playerSortBy, setPlayerSortBy, playerSortInvert, setPlayerSortInvert,
    oppSortBy, setOppSortBy, oppSortInvert, setOppSortInvert,
    playerArchSortBy, setPlayerArchSortBy, playerArchSortInvert, setPlayerArchSortInvert,
    playerColorSortBy, setPlayerColorSortBy, playerColorSortInvert, setPlayerColorSortInvert,
    selectedPlayer, setSelectedPlayer, selectedArchetype, setSelectedArchetype,
    sortBy, setSortBy, minSynergyDecks, setMinSynergyDecks, synergySortBy, setSynergySortBy,
    display, setDisplay
  } = filters;

  // Navigation handlers
  const onSubpageClicked = (idx) => {
    let d = [...display];
    d[idx] = !d[idx];
    for (let i in d) if (i != idx) d[i] = false;
    setDisplay(d);
    setMinGames(0); setMinPlayers(0); setMaxPlayers(0); setMinDrafts(0);
  };

  const onDraftLogSelected = (event) => {
    setSelectedDraftLog(event.target.value);
    let users = [{ label: "", value: "" }];
    for (let draft of Object.values(drafts || {})) {
      if (draft.date === event.target.value) {
        for (let user of Object.values(draft.users)) {
          if (!user.isBot) users.push({ label: user.userID, value: user.userName });
        }
      }
    }
    setDraftPlayers(users);
  };

  const onDraftPlayerSelected = (event) => {
    setSelectedDraftPlayer(event.target.value);
    let numPicks = 0;
    for (let draft of Object.values(drafts || {})) {
      if (draft.date === selectedDraftLog) {
        for (let user of Object.values(draft.users)) {
          if (user.userName === event.target.value) {
            numPicks = user.picks.length;
            break;
          }
        }
        break;
      }
    }
    let pickOpts = [];
    for (let i = 1; i <= numPicks; i++) pickOpts.push({ label: i, value: i });
    setDraftPacks(pickOpts);
  };

  return (
    <div id="root">
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
        playerMatch={playerMatch}
        onPlayerMatchChanged={(e) => setPlayerMatch(e.target.value)}
        parsed={parsed}
        display={display}
        onColorPage={() => onSubpageClicked(0)}
        onArchetypePage={() => onSubpageClicked(1)}
        onCardPage={() => onSubpageClicked(2)}
        onDeckPage={() => onSubpageClicked(3)}
        onDraftPage={() => onSubpageClicked(4)}
        onPlayersPage={() => onSubpageClicked(5)}
        onSynergyPage={() => onSubpageClicked(6)}
        matchStr={typingStr}
        onMatchUpdated={(e) => setTypingStr(e.target.value)}
      />

      <div id="widgets" className="house-for-widgets">
        <SynergyWidget
          show={display[6]} synergyData={synergyData} minSynergyDecks={minSynergyDecks}
          onMinSynergyDecksChanged={(e) => setMinSynergyDecks(e.target.value)}
          onHeaderClick={(e) => setSynergySortBy(e.currentTarget.id)}
          sortBy={synergySortBy} onCardSelected={(e) => setSelectedCard(e.currentTarget.id)}
        />

        <ColorWidget
          parsed={parsed} ddOpts={[{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]}
          colorTypeSelection={colorTypeSelection} onSelected={(e) => setColorTypeSelection(e.target.value)}
          onBucketSelected={(e) => setSelectedBucket(e.target.value)}
          decks={parsed.filteredDecks} onHeaderClick={(e) => setColorSortBy(e.currentTarget.id)}
          colorSortBy={colorSortBy} bucketSize={bucketSize} strictColors={strictColors}
          onStrictCheckbox={() => setStrictColors(!strictColors)}
          selectedBucket={selectedBucket} show={display[0]}
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
          xAxis={xAxis} yAxis={yAxis} onXAxisSelected={(e) => setXAxis(e.target.value)}
          onYAxisSelected={(e) => setYAxis(e.target.value)}
          show={display[2]}
        />

        <DraftWidget
          parsed={parsed} decks={parsed.filteredDecks} drafts={drafts} cube={cube}
          sortBy={draftSortBy} invertSort={draftSortInvert}
          onHeaderClick={(e) => {
            if (draftSortBy === e.currentTarget.id) setDraftSortInvert(!draftSortInvert);
            else { setDraftSortInvert(false); setDraftSortBy(e.currentTarget.id); }
          }}
          minDrafts={minDrafts} onMinDraftsSelected={(e) => setMinDrafts(e.target.value)}
          minDeviation={minDeviation} onMinDeviationChanged={(e) => setMinDeviation(e.target.value)}
          maxDeviation={maxDeviation} onMaxDeviationChanged={(e) => setMaxDeviation(e.target.value)}
          minAvgPick={minAvgPick} onMinAvgPickSelected={(e) => setMinAvgPick(e.target.value)}
          maxAvgPick={maxAvgPick} onMaxAvgPickSelected={(e) => setMaxAvgPick(e.target.value)}
          playerMatch={playerMatch} draftLogs={draftLogs}
          selectedDraftLog={selectedDraftLog} onDraftLogSelected={onDraftLogSelected}
          draftPlayers={draftPlayers} onDraftPlayerSelected={onDraftPlayerSelected}
          selectedPlayer={selectedDraftPlayer} draftPacks={draftPacks}
          onPackSelected={(e) => setSelectedPack(e.target.value)}
          selectedPack={selectedPack} show={display[4]}
        />

        <DeckWidget
          parsed={parsed} graphData={graphData} decks={parsed.filteredDecks} show={display[3]}
          xAxis={xAxis} yAxis={yAxis} onXAxisSelected={(e) => setXAxis(e.target.value)}
          onYAxisSelected={(e) => setYAxis(e.target.value)}
        />

        <PlayerWidget
          parsed={parsed} decks={parsed.filteredDecks} bucketSize={bucketSize}
          sortBy={playerSortBy} invertSort={playerSortInvert}
          onHeaderClick={(e) => {
            if (playerSortBy === e.currentTarget.id) setPlayerSortInvert(!playerSortInvert);
            else { setPlayerSortInvert(false); setPlayerSortBy(e.currentTarget.id); }
          }}
          oppSortBy={oppSortBy} oppSortInvert={oppSortInvert}
          onOppHeaderClick={(e) => {
            if (oppSortBy === e.currentTarget.id) setOppSortInvert(!oppSortInvert);
            else { setOppSortInvert(false); setOppSortBy(e.currentTarget.id); }
          }}
          playerArchSortBy={playerArchSortBy} playerArchSortInvert={playerArchSortInvert}
          onPlayerArchHeaderClick={(e) => {
            if (playerArchSortBy === e.currentTarget.id) setPlayerArchSortInvert(!playerArchSortInvert);
            else { setPlayerArchSortInvert(false); setPlayerArchSortBy(e.currentTarget.id); }
          }}
          playerColorSortBy={playerColorSortBy} playerColorSortInvert={playerColorSortInvert}
          onPlayerColorHeaderClick={(e) => {
            if (playerColorSortBy === e.currentTarget.id) setPlayerColorSortInvert(!playerColorSortInvert);
            else { setPlayerColorSortInvert(false); setPlayerColorSortBy(e.currentTarget.id); }
          }}
          handleRowClick={(e) => setSelectedPlayer(e.currentTarget.id)}
          player={selectedPlayer} minGames={minGames}
          onMinGamesSelected={(e) => setMinGames(e.target.value)}
          show={display[5]}
        />
      </div>
    </div>
  );
}
