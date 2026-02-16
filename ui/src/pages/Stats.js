import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadCube, LoadDecks, LoadArchetypeData, LoadDrafts} from "../utils/Fetch.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { Button, TextInput, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { ColorWidget} from "./Colors.js"
import { ArchetypeWidget, ArchetypeData } from "./Types.js"
import { DeckWidget, BuildGraphData } from "./Decks.js"
import { PlayerWidget } from "./Players.js"
import { CardWidget } from "./Cards.js"
import { SynergyWidget } from "./Synergy.js"
import { DeckBuckets } from "../utils/Buckets.js"
import { GetColorStats } from "./Colors.js"
import { PlayerData } from "./Players.js"
import { DraftWidget } from "./Drafts.js"
import { AggregatedPickInfo } from "../utils/DraftLog.js"
import { CardMatches, DeckMatches, QueryTerms } from "../utils/Query.js"

import {
  NumDecksOption,
  ELOOption,
} from "./Cards.js"


// StatsViewer displays stats spanning the selected drafts.
export function StatsViewer(props) {
  // Store all of the decks, and the cube.
  const [decks, setDecks] = useState([]);
  const [cube, setCube] = useState({"cards": []});
  const [archetypeStats, setArchetypeStats] = useState(new Map());
  const [playerStats, setPlayerStats] = useState(new Map());

  // Triggers a refresh.
  const [refresh, setRefresh] = useState(1);
  function triggerRefresh(event) {
    setRefresh(refresh + 1)
  }

  const [bucketSize, setNumBuckets] = useState(5);
  const [playerMatch, setPlayerMatch] = useState("");
  const [minDraftSize, setMinDraftSize] = useState(0);
  const [manaValue, setManaValue] = useState(-1);

  function onBucketsChanged(event) {
    let num = event.target.value
    if (num < 1) {
      num = 1
    }
    setNumBuckets(num)
  }
  function onPlayerMatchChanged(event) {
    setPlayerMatch(event.target.value)
  }
  function onMinDraftSizeChanged(event) {
    setMinDraftSize(event.target.value)
  }
  function onManaValueChanged(event) {
    setManaValue(event.target.value)
  }

  const [selectedBucket, setSelectedBucket] = useState("ALL");
  function onBucketSelected(event) {
    setSelectedBucket(event.target.value)
  }

  const [colorTypeSelection, setColorTypeSelection] = useState("Mono");
  const [colorSortBy, setColorSortBy] = useState("win");
  const [strictColors, setStrictColors] = useState(false);
  const [colorCheckboxes, setColorCheckboxes] = useState([false, false, false, false, false]);
  const ddOpts =  [{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]
  function onColorTypeSelected(event) {
    setColorTypeSelection(event.target.value)
  }
  function onColorHeaderClicked(event) {
    setColorSortBy(event.target.id)
  }
  function onStrictCheckbox(event) {
    setStrictColors(!strictColors)
  }
  function onColorSelectionCheckbox(event) {
    let updated = [...colorCheckboxes]
    switch (event.target.id) {
      case "W":
        updated[0] = !colorCheckboxes[0];
        break;
      case "U":
        updated[1] = !colorCheckboxes[1];
        break;
      case "B":
        updated[2] = !colorCheckboxes[2];
        break;
      case "R":
        updated[3] = !colorCheckboxes[3];
        break;
      case "G":
        updated[4] = !colorCheckboxes[4];
        break;
    }
    const newboxes = [...updated]
    setColorCheckboxes(newboxes)
  }

  const [cardWidgetSelection, setCardWidgetSelection] = useState("Mainboard rate");
  const [minDrafts, setMinDrafts] = useState(0);
  const [minGames, setMinGames] = useState(0);
  const [minPlayers, setMinPlayers] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [selectedCard, setSelectedCard] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  function onCardFilterSelected(event) {
    setCardFilter(event.target.value);
  }
  const cardWidgetOpts =  [
    { label: "Mainboard rate", value: "Mainboard rate" },
    { label: "Win rate", value: "Win rate" },
    { label: "Versus archetype", value: "Versus archetype" },
    { label: "By archetype", value: "By archetype" },
  ]
  const [cardWidgetColorSelection, setCardWidgetColorSelection] = useState("");
  const cardWidgetColorOpts = [
    { label: "", value: "" },
    { label: "Red", value: "R" },
    { label: "Blue", value: "U" },
    { label: "Green", value: "G" },
    { label: "Black", value: "B" },
    { label: "White", value: "W" },
  ]
  const [cardWidgetSortBy, setCardWidgetSortBy] = useState("");
  function onCardWidgetHeaderClicked(event) {
    setCardWidgetSortBy(event.target.id)
  }
  function onCardWidgetSelected(event) {
    setCardWidgetSelection(event.target.value)
  }
  function onCardWidgetColorSelected(event) {
    setCardWidgetColorSelection(event.target.value)
  }
  function onMinDraftsSelected(event) {
    setMinDrafts(event.target.value)
  }
  function onMinGamesSelected(event) {
    setMinGames(event.target.value)
  }
  function onMinPlayersSelected(event) {
    setMinPlayers(event.target.value)
  }
  function onMaxPlayersSelected(event) {
    setMaxPlayers(event.target.value)
  }
  function onCardSelected(event) {
    setSelectedCard(event.target.id)
  }

  const [xAxis, setxAxis] = useState(NumDecksOption)
  const [yAxis, setYAxis] = useState(ELOOption)
  function onXAxisSelected(event) {
    setxAxis(event.target.value)
  }
  function onYAxisSelected(event) {
    setYAxis(event.target.value)
  }

  let startDate = props.startDate
  let endDate = props.endDate

  const [drafts, setDrafts] = useState(null);
  const [draftSortBy, setDraftSortBy] = useState("p1p1");
  const [draftSortInvert, setDraftSortInvert] = useState(false);
  const [minDeviation, setMinDeviation] = useState(0);
  const [maxDeviation, setMaxDeviation] = useState(0);
  const [minAvgPick, setMinAvgPick] = useState(0);
  const [maxAvgPick, setMaxAvgPick] = useState(0);
  function onMinDeviationSelected(event) {
    setMinDeviation(event.target.value)
  }
  function onMaxDeviationSelected(event) {
    setMaxDeviation(event.target.value)
  }
  function onMinAvgPickSelected(event) {
    setMinAvgPick(event.target.value)
  }
  function onMaxAvgPickSelected(event) {
    setMaxAvgPick(event.target.value)
  }

  function onDraftHeaderClicked(event) {
    if (draftSortBy == event.target.id) {
      setDraftSortInvert(!draftSortInvert)
    } else {
      setDraftSortInvert(false)
    }
    setDraftSortBy(event.target.id)
  }

  const [draftLogs, setDraftLogs] = useState([]);

  const [selectedDraftLog, setSelectedDraftLog] = useState("");
  function onDraftLogSelected(event) {
    setSelectedDraftLog(event.target.value)

    let users = [{label: "", value: ""}]
    for (let [idx, draft] of Object.entries(drafts)) {
      if (draft.date == event.target.value) {
        for (let [userID, user] of Object.entries(draft.users)) {
          if (!user.isBot) {
            users.push({
              label: userID,
              value: user.userName,
            })
          }
        }
      }
    }
    setDraftPlayers(users)
  }

  const [selectedDraftPlayer, setSelectedDraftPlayer] = useState("");
  const [draftPlayers, setDraftPlayers] = useState([]);
  const [draftPacks, setDraftPacks] = useState([])
  function onDraftPlayerSelected(event) {
    setSelectedDraftPlayer(event.target.value);

    let numPicks = 0
    for (let [idx, draft] of Object.entries(drafts)) {
      if (draft.date != selectedDraftLog) {
        continue
      }

      for (let [id, user] of Object.entries(draft.users)) {
        if (user.userName === event.target.value) {
          numPicks = user.picks.length
          break
        }
      }
      break
    }

    let pickOpts = []
    for (var i=1; i<=numPicks; i++) {
      pickOpts.push({label: i, value: i})
    }
    setDraftPacks(pickOpts)
  }

  const [selectedPack, setSelectedPack] = useState(1)
  function onPackSelected(event) {
    setSelectedPack(event.target.value)
  }

  const [playerSortBy, setPlayerSortBy] = useState("");
  const [playerSortInvert, setPlayerSortInvert] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  function onPlayerHeaderClicked(event) {
    if (playerSortBy == event.target.id) {
      setPlayerSortInvert(!playerSortInvert)
    } else {
      setPlayerSortInvert(false)
    }
    setPlayerSortBy(event.target.id)
  }
  function handlePlayerClick(event) {
      setSelectedPlayer(event.target.id)
  }

  const [selectedArchetype, setSelectedArchetype] = useState("aggro");
  const [archetypeDropdownOptions, setArchetypeDropdownOptions] = useState([]);
  const [sortBy, setSortBy] = useState("");
  const [archetypeMatchups, setArchetypeMatchups] = useState([]);
  function onArchetypeSelected(event) {
    setSelectedArchetype(event.target.value)
  }
  function onHeaderClick(event) {
    setSortBy(event.target.id)
  }
  function handleRowClick(event) {
      setSelectedArchetype(event.target.id)
  }

  const [synergyData, setSynergyData] = useState([]);
  const [minSynergyDecks, setMinSynergyDecks] = useState(3);
  const [synergySortBy, setSynergySortBy] = useState("synergy");
  function onSynergyHeaderClicked(event) {
    setSynergySortBy(event.target.id)
  }
  function onMinSynergyDecksChanged(event) {
    setMinSynergyDecks(event.target.value)
  }

  async function loadSynergyData(cb) {
    const resp = await fetch(`/api/stats/synergy?min_decks=${minSynergyDecks}&start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`);
    let d = await resp.json();
    cb(d)
  }
  function onSynergyDataFetched(d) {
    setSynergyData(d.pairs)
  }

  useEffect(() => {
    loadSynergyData(onSynergyDataFetched)
  }, [minSynergyDecks, minDraftSize, playerMatch, startDate, endDate, refresh])

  const [display, setDisplay] = useState([true, false, false, false, false, false, false]);
  function onSubpageClicked(idx) {
    let d = {...display}
    if (d[idx]) {
      d[idx] = false
    } else {
      d[idx] = true
    }
    for (var i in d) {
      if (i != idx) {
        d[i] = false
      }
    }
    setDisplay(d)
    setMinGames(0)
    setMinPlayers(0)
    setMaxPlayers(0)
    setMinDrafts(0)
  }
  function onColorPage() {
    onSubpageClicked(0)
  }
  function onArchetypePage() {
    onSubpageClicked(1)
  }
  function onCardPage() {
    onSubpageClicked(2)
  }
  function onDeckPage() {
    onSubpageClicked(3)
  }
  function onDraftPage() {
    onSubpageClicked(4)
  }
  function onPlayersPage() {
    onSubpageClicked(5)
  }
  function onSynergyPage() {
    onSubpageClicked(6)
  }

  const filteredDecks = React.useMemo(() => {
    if (decks.length == 0) {
      return []
    }

    let f = []
    let filterByColor = colorCheckboxes.some(function(element) {return element})
    for (let deck of decks) {
      if (props.matchStr && !DeckMatches(deck, props.matchStr, "Mainboard")) {
        continue
      }

      let deckMatches = true
      if (filterByColor) {
        let enabledColors = CheckboxesToColors(colorCheckboxes)
          for (let color of enabledColors) {
            if (!deck.colors.includes(color)) {
              deckMatches = false
              break
             }
          }
      }
      if (deckMatches) {
          f.push(deck)
      }
    }
    return f
  }, [decks, colorCheckboxes, props.matchStr, refresh])

  // Use server-side stats for the main display, falling back to client-side calculation
  // only when color filtering is active (since server doesn't support color filtering for these yet).
  const archetypeData = React.useMemo(() => {
    let filterByColor = colorCheckboxes.some(function(element) {return element})
    if (filterByColor || props.matchStr) {
      return ArchetypeData(filteredDecks)
    }
    return archetypeStats
  }, [filteredDecks, archetypeStats, colorCheckboxes, props.matchStr])

  const playerData = React.useMemo(() => {
    let filterByColor = colorCheckboxes.some(function(element) {return element})
    if (filterByColor || props.matchStr) {
      const pd = PlayerData(filteredDecks)
      for (let d of pd.values()) {
        d.archetypeData = ArchetypeData(d.decks)
        d.colorData = GetColorStats(d.decks, strictColors)
      }
      return pd
    }
    return playerStats
  }, [filteredDecks, playerStats, colorCheckboxes, props.matchStr, strictColors])

  const deckBuckets = React.useMemo(() => {
    if (filteredDecks.length == 0) {
      return []
    }
    const db = DeckBuckets(filteredDecks, bucketSize, false)
    for (let b of db) {
      let bucketDecks = new Array()
      for (let draft of b) {
        bucketDecks = bucketDecks.concat(draft.decks)
      }
      b.archetypeData = ArchetypeData(bucketDecks)
      b.playerData = PlayerData(bucketDecks)
    }
    return db
  }, [filteredDecks, bucketSize])

  const pickInfo = React.useMemo(() => AggregatedPickInfo(drafts, cube, playerMatch), [drafts, cube, playerMatch])

  const [cardDataBucketed, setCardDataBucketed] = useState([]);
  const [cardData, setCardData] = useState(new Map());

  async function loadArchetypeStats(cb) {
    const resp = await fetch(`/api/stats/archetypes?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`);
    let d = await resp.json();
    cb(d)
  }
  function onArchetypeStatsFetched(d) {
    const archetypes = new Map();
    for (const [name, data] of Object.entries(d.archetypes)) {
      // Transform server data to match UI expectations.
      archetypes.set(name, {
        ...data,
        sharedWith: new Map(Object.entries(data.shared_with || {})),
        players: new Map(Object.entries(data.players || {})),
      });
    }
    setArchetypeStats(archetypes)
  }

  async function loadPlayerStats(cb) {
    const resp = await fetch(`/api/stats/players?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`);
    let d = await resp.json();
    cb(d)
  }
  function onPlayerStatsFetched(d) {
    const players = new Map();
    for (const [name, data] of Object.entries(d.players)) {
      // Transform server data to match UI expectations.
      players.set(name, {
        ...data,
        // PlayerData in Players.js expects 'cards' as a Map of card name to {name, count}.
        cards: new Map(Object.entries(data.unique_cards || {}).map(([cardName, count]) => [cardName, {name: cardName, count}])),
      });
    }
    setPlayerStats(players)
  }

  useEffect(() => {
    loadArchetypeStats(onArchetypeStatsFetched)
    loadPlayerStats(onPlayerStatsFetched)
  }, [startDate, endDate, minDraftSize, playerMatch, refresh])

  async function loadCardData(cb) {
    const resp = await fetch(`/api/stats/cards?color=${cardWidgetColorSelection}&min_drafts=${minDrafts}&min_games=${minGames}&start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}`);
    let d = await resp.json();
    cb(d)
  }
  function onCardDataFetched(d) {
    const dm = new Map(Object.entries(d.all.data))
    setCardData(dm)
  }
  async function loadBucketedCardData(cb) {
    const resp = await fetch(`/api/stats/cards?color=${cardWidgetColorSelection}&min_drafts=${minDrafts}&min_games=${minGames}&bucket_size=${bucketSize}&sliding=true`);
    let d = await resp.json();
    cb(d)
  }
  function onBucketedCardDataFetched(d) {
    const da = Array.from(d.buckets)
    setCardDataBucketed(da)
  }

  useEffect(() => {
    loadCardData(onCardDataFetched)
  }, [cardWidgetColorSelection, minDrafts, minGames, startDate, endDate, minDraftSize, playerMatch, refresh])

  useEffect(() => {
    loadBucketedCardData(onBucketedCardDataFetched)
  }, [cardWidgetColorSelection, minDrafts, minGames, bucketSize, refresh])

  const [colorData, setColorData] = useState(new Map());
  const [colorDataBucketed, setColorDataBucketed] = useState([]);

  async function loadColorData(cb) {
    const resp = await fetch(`/api/stats/colors?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}&strict_colors=${strictColors}`);
    let d = await resp.json();
    cb(d)
  }

  function onColorDataFetched(d) {
    setColorData(new Map(Object.entries(d.all.data)))
  }

  async function loadBucketedColorData(cb) {
    const resp = await fetch(`/api/stats/colors?start=${startDate}&end=${endDate}&size=${minDraftSize}&player=${playerMatch}&strict_colors=${strictColors}&bucket_size=${bucketSize}&sliding=true`);
    let d = await resp.json();
    cb(d)
  }

  async function onBucketedColorDataFetched(d) {
    setColorDataBucketed(Array.from(d.buckets))
  }

  useEffect(() => {
    loadColorData(onColorDataFetched)
  }, [strictColors, startDate, endDate, minDraftSize, playerMatch, refresh])

  useEffect(() => {
    loadBucketedColorData(onBucketedColorDataFetched)
  }, [strictColors, bucketSize, startDate, endDate, minDraftSize, playerMatch, refresh])

  useEffect(() => {
    Promise.all([
      LoadDecks(onDecksLoaded, startDate, endDate, minDraftSize, playerMatch),
      LoadDrafts(onDraftsLoaded, startDate, endDate),
      LoadCube(onCubeLoad),
      LoadArchetypeData(onArchetypeDataLoaded, startDate, endDate, minDraftSize, playerMatch),
    ])
  }, [refresh])

  function onDecksLoaded(d) {
    setDecks([...d])

    let archetypes = new Map()
    for (var i in d) {
      let deck = d[i]
      for (var j in deck.labels) {
        let arch = deck.labels[j]
        archetypes.set(arch, 0)
      }
    }
    let opts = []
    for (let arch of archetypes.keys()) {
      opts.push({label: arch, value: arch})
    }
    setArchetypeDropdownOptions(opts)
  }
  function onCubeLoad(c) {
    setCube({...c})
  }
  function onDraftsLoaded(d) {
    setDrafts({...d})

    let draftDates = [{label: "", value: ""}]
    for (let draft of d) {
      if (draft.type != "Draft") {
        continue
      }

      draftDates.push({
        label: draft.date,
        value: draft.date,
      })
    }
    setDraftLogs(draftDates)
  }

  function onArchetypeDataLoaded(a) {
    setArchetypeMatchups(a)
  }

  const parsed = React.useMemo(() => ({
    bucketSize,
    filteredDecks,
    archetypeData,
    playerData,
    pickInfo,
    colorData,
    colorDataBucketed,
    deckBuckets,
  }), [bucketSize, filteredDecks, archetypeData, playerData, pickInfo, colorData, colorDataBucketed, deckBuckets])

  const graphData = React.useMemo(() => BuildGraphData(parsed), [parsed])

  return (
    <div id="root">
      <SelectorBar
        triggerRefresh={triggerRefresh}
        startDate={startDate}
        onStartSelected={props.onStartSelected}
        endDate={endDate}
        onEndSelected={props.onEndSelected}
        bucketSize={bucketSize}
        onBucketsChanged={onBucketsChanged}
        minDrafts={minDrafts}
        onMinDraftSizeChanged={onMinDraftSizeChanged}
        playerMatch={playerMatch}
        onPlayerMatchChanged={onPlayerMatchChanged}
        parsed={parsed}
        display={display}
        onColorPage={onColorPage}
        onArchetypePage={onArchetypePage}
        onCardPage={onCardPage}
        onDeckPage={onDeckPage}
        onDraftPage={onDraftPage}
        onPlayersPage={onPlayersPage}
        onSynergyPage={onSynergyPage}
        matchStr={props.matchStr}
        onMatchUpdated={props.onMatchUpdated}
      />


      <div id="widgets" className="house-for-widgets">
        <SynergyWidget
          show={display[6]}
          synergyData={synergyData}
          minSynergyDecks={minSynergyDecks}
          onMinSynergyDecksChanged={onMinSynergyDecksChanged}
          onHeaderClick={onSynergyHeaderClicked}
          sortBy={synergySortBy}
          onCardSelected={onCardSelected}
        />

        <ColorWidget
          parsed={parsed}
          ddOpts={ddOpts}
          colorTypeSelection={colorTypeSelection}
          onSelected={onColorTypeSelected}
          onBucketSelected={onBucketSelected}
          decks={parsed.filteredDecks}
          onHeaderClick={onColorHeaderClicked}
          colorSortBy={colorSortBy}
          bucketSize={bucketSize}
          strictColors={strictColors}
          onStrictCheckbox={onStrictCheckbox}
          selectedBucket={selectedBucket}
          show={display[0]}
        />

        <ArchetypeWidget
          parsed={parsed}
          cardData={cardData}
          decks={decks}
          cube={cube}
          show={display[1]}
          bucketSize={bucketSize}
          matchups={archetypeMatchups}
          dropdownSelection={colorTypeSelection}
          cardWidgetOpts={cardWidgetOpts}
          onSelected={onCardWidgetSelected}
          colorWidgetOpts={cardWidgetColorOpts}
          colorSelection={cardWidgetColorSelection}
          onColorSelected={onCardWidgetColorSelected}
          archetypeDropdownOptions={archetypeDropdownOptions}
          selectedArchetype={selectedArchetype}
          onArchetypeSelected={onArchetypeSelected}
          onColorChecked={onColorSelectionCheckbox}
          colorCheckboxes={colorCheckboxes}
          onMinDraftsSelected={onMinDraftsSelected}
          minDrafts={minDrafts}
          onMinGamesSelected={onMinGamesSelected}
          minDecksInArch={minGames} // We overload the use of minGames here.
          sortBy={sortBy}
          onHeaderClick={onHeaderClick}
          handleRowClick={handleRowClick}
        />

        <CardWidget
          parsed={parsed}
          matchStr={props.matchStr}
          cardData={cardData}
          cardDataBucketed={cardDataBucketed}
          decks={parsed.filteredDecks}
          dropdownSelection={cardWidgetSelection}
          cardFilter={cardFilter}
          onCardFilterSelected={onCardFilterSelected}
          cardWidgetOpts={cardWidgetOpts}
          onSelected={onCardWidgetSelected}
          onCardSelected={onCardSelected}
          selectedCard={selectedCard}
          colorWidgetOpts={cardWidgetColorOpts}
          colorSelection={cardWidgetColorSelection}
          onColorSelected={onCardWidgetColorSelected}
          minDrafts={minDrafts}
          onMinDraftsSelected={onMinDraftsSelected}
          minGames={minGames}
          onMinGamesSelected={onMinGamesSelected}
          minPlayers={minPlayers}
          maxPlayers={maxPlayers}
          onMinPlayersSelected={onMinPlayersSelected}
          onMaxPlayersSelected={onMaxPlayersSelected}
          onHeaderClick={onCardWidgetHeaderClicked}
          manaValue={manaValue}
          onManaValueSelected={onManaValueChanged}
          sortBy={cardWidgetSortBy}
          bucketSize={bucketSize}
          cube={cube}
          xAxis={xAxis}
          yAxis={yAxis}
          onXAxisSelected={onXAxisSelected}
          onYAxisSelected={onYAxisSelected}
          show={display[2]}
        />

        <DraftWidget
          parsed={parsed}
          decks={parsed.filteredDecks}
          drafts={drafts}
          cube={cube}
          sortBy={draftSortBy}
          invertSort={draftSortInvert}
          onHeaderClick={onDraftHeaderClicked}
          minDrafts={minDrafts}
          onMinDraftsSelected={onMinDraftsSelected}
          minDeviation={minDeviation}
          onMinDeviationChanged={onMinDeviationSelected}
          maxDeviation={maxDeviation}
          onMaxDeviationChanged={onMaxDeviationSelected}
          minAvgPick={minAvgPick}
          onMinAvgPickSelected={onMinAvgPickSelected}
          maxAvgPick={maxAvgPick}
          onMaxAvgPickSelected={onMaxAvgPickSelected}
          playerMatch={playerMatch}

          draftLogs={draftLogs}
          selectedDraftLog={selectedDraftLog}
          onDraftLogSelected={onDraftLogSelected}

          draftPlayers={draftPlayers}
          onDraftPlayerSelected={onDraftPlayerSelected}
          selectedPlayer={selectedDraftPlayer}

          draftPacks={draftPacks}
          onPackSelected={onPackSelected}
          selectedPack={selectedPack}

          show={display[4]}
        />

        <DeckWidget
          parsed={parsed}
          graphData={graphData}
          decks={parsed.filteredDecks}
          show={display[3]}
          xAxis={xAxis}
          yAxis={yAxis}
          onXAxisSelected={onXAxisSelected}
          onYAxisSelected={onYAxisSelected}
        />

        <PlayerWidget
          parsed={parsed}
          decks={parsed.filteredDecks}
          bucketSize={bucketSize}
          sortBy={playerSortBy}
          invertSort={playerSortInvert}
          onHeaderClick={onPlayerHeaderClicked}
          handleRowClick={handlePlayerClick}
          player={selectedPlayer}
          minGames={minGames}
          onMinGamesSelected={onMinGamesSelected}
          show={display[5]}
        />

      </div>
    </div>
  );
}

function SelectorBar(input) {
  return (
  <table id="selectorbar" className="selectorbar">
    <tbody>
    <tr>
      <Button
        text="Refresh"
        onClick={input.triggerRefresh}
      />

      <DateSelector
        label="From: "
        id="from"
        value={input.startDate}
        onChange={input.onStartSelected}
      />
      <DateSelector
        label="To: "
        id="to"
        value={input.endDate}
        onChange={input.onEndSelected}
      />

      <NumericInput className="dropdown" label="Bucket size" value={input.bucketSize} onChange={input.onBucketsChanged} />
      <NumericInput className="dropdown" label="Draft size" value={input.minDraftSize} onChange={input.onMinDraftSizeChanged} />

      <TextInput
        className="dropdown"
        label="Player"
        value={input.playerMatch}
        onChange={input.onPlayerMatchChanged}
      />

      <TextInput
        className="dropdown"
        label="Search"
        placeholder={QueryTerms}
        big={true}
        value={input.matchStr}
        onChange={input.onMatchUpdated}
      />

    </tr>

    <tr>
      <Overview decks={input.parsed.filteredDecks} />

      <Button
        text="Colors"
        checked={input.display[0]}
        onClick={input.onColorPage}
      />
      <Button
        text="Types"
        checked={input.display[1]}
        onClick={input.onArchetypePage}
      />
      <Button
        text="Cards"
        checked={input.display[2]}
        onClick={input.onCardPage}
      />
      <Button
        text="Decks"
        checked={input.display[3]}
        onClick={input.onDeckPage}
      />
      <Button
        text="Drafts"
        checked={input.display[4]}
        onClick={input.onDraftPage}
      />
      <Button
        text="Players"
        checked={input.display[5]}
        onClick={input.onPlayersPage}
      />
      <Button
        text="Synergy"
        checked={input.display[6]}
        onClick={input.onSynergyPage}
      />
    </tr>
    </tbody>
  </table>
  );
}

export function InitialDates() {
  // Create a new Date object for today to represent the end date.
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() + 1; // Months are 0-indexed, so we add 1
  let day = today.getDate();
  const end = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  // Just need some date prior to the first draft. This will get overwritten as soon as decks are loaded.
  const start = "1990-09-15"

  return [start, end]
}


function Overview(input) {
  if (input.decks == null) {
    return null
  }
  // Figure out how many decks and drafts we're looking at.
  let numDecks = 0
  let numDrafts = 0
  let drafts = new Map()
  for (var i in input.decks) {
    numDecks += 1
    drafts.set(input.decks[i].metadata.draft_id, true)
  }
  numDrafts = drafts.size

  return (
    <label className="dropdown">
      <label>Displaying stats for {numDrafts} drafts, {numDecks} decks</label>
    </label>
  )
}

function PrintRow({ k, value, p }) {
  return (
    <tr key={k} className="widget-table-row">
      <td key="k">{k}</td>
      <td key="p">{p}%</td>
      <td key="value">{value}</td>
    </tr>
  );
}

export function CheckboxesToColors(checkboxes) {
  let colors = []
  if (checkboxes[0]) {
    colors.push("W")
  }
  if (checkboxes[1]) {
    colors.push("U")
  }
  if (checkboxes[2]) {
    colors.push("B")
  }
  if (checkboxes[3]) {
    colors.push("R")
  }
  if (checkboxes[4]) {
    colors.push("G")
  }
  return colors
}

