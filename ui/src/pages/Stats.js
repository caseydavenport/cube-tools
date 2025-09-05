import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadCube, LoadDecks, LoadArchetypeData, LoadDrafts} from "../utils/Fetch.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { Button, TextInput, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { ColorWidget} from "./Colors.js"
import { ArchetypeWidget, ArchetypeData } from "./Types.js"
import { DeckWidget } from "./Decks.js"
import { PlayerWidget } from "./Players.js"
import { CardWidget } from "./Cards.js"
import { CardData } from "../utils/Cards.js"
import { DeckBuckets } from "../utils/Buckets.js"
import { GetColorStats } from "./Colors.js"
import { PlayerData } from "./Players.js"
import { DraftWidget } from "./Drafts.js"
import { AggregatedPickInfo } from "../utils/DraftLog.js"

import {
  NumDecksOption,
  ELOOption,
} from "./Cards.js"


// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks, and the cube.
  const [decks, setDecks] = useState([]);
  const [cube, setCube] = useState({"cards": []});

  // Triggers a refresh.
  const [refresh, setRefresh] = useState(1);
  function triggerRefresh(event) {
    setRefresh(refresh + 1)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for all widgets.
  ///////////////////////////////////////////////////////////////////////////////
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

  ///////////////////////////////////////////////////////////////////////////////
  // For bucket selection
  ///////////////////////////////////////////////////////////////////////////////
  const [selectedBucket, setSelectedBucket] = useState("ALL");
  function onBucketSelected(event) {
    setSelectedBucket(event.target.value)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the color / color pair win rate widget.
  ///////////////////////////////////////////////////////////////////////////////
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


  ///////////////////////////////////////////////////////////////////////////////
  // State used for the card widget.
  ///////////////////////////////////////////////////////////////////////////////
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

  ///////////////////////////////////////////////////////////////////////////////
  // Shared between the Card and Deck widgets.
  ///////////////////////////////////////////////////////////////////////////////
  const [xAxis, setxAxis] = useState(NumDecksOption)
  const [yAxis, setYAxis] = useState(ELOOption)
  function onXAxisSelected(event) {
    setxAxis(event.target.value)
  }
  function onYAxisSelected(event) {
    setYAxis(event.target.value)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for time selection.
  ///////////////////////////////////////////////////////////////////////////////
  let [start, end ] = InitialDates()
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  function onStartSelected(event) {
    setStartDate(event.target.value)
  }
  function onEndSelected(event) {
    setEndDate(event.target.value)
  }

  // Track whether we have completed initial loading of data on page refresh.
  const [awaitingLoad, setAwaitingLoad] = useState(true);

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the draft stats tab.
  ///////////////////////////////////////////////////////////////////////////////
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
      // The same header was clicked again. Invert the sorting.
      setDraftSortInvert(!draftSortInvert)
    } else {
      // A new header was clicked - default to non-inverted.
      setDraftSortInvert(false)
    }
    setDraftSortBy(event.target.id)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the draft pack display widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [draftLogs, setDraftLogs] = useState([]);

  const [selectedDraftLog, setSelectedDraftLog] = useState("");
  function onDraftLogSelected(event) {
    // Set the selected draft log, and load players.
    setSelectedDraftLog(event.target.value)

    // Set players from the selected draft.
    let users = [{label: "", value: ""}]
    for (let [idx, draft] of Object.entries(drafts)) {
      if (draft.date == event.target.value) {
        for (let [userID, user] of Object.entries(draft.users)) {
          // Skip bots.
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
    // Set the selected player.
    setSelectedDraftPlayer(event.target.value);

    // Get the selected draft.
    let numPicks = 0
    for (let [idx, draft] of Object.entries(drafts)) {
      if (draft.date != selectedDraftLog) {
        continue
      }

      // Got it. Figure out how many picks this player had.
      for (let [id, user] of Object.entries(draft.users)) {
        if (user.userName === event.target.value) {
          numPicks = user.picks.length
          break
        }
      }
      break
    }

    // Update the packs dropdown.
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

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the player stats tab.
  ///////////////////////////////////////////////////////////////////////////////
  const [playerSortBy, setPlayerSortBy] = useState("");
  const [playerSortInvert, setPlayerSortInvert] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  function onPlayerHeaderClicked(event) {
    if (playerSortBy == event.target.id) {
      // The same header was clicked again. Invert the sorting.
      setPlayerSortInvert(!playerSortInvert)
    } else {
      // A new header was clicked - default to non-inverted.
      setPlayerSortInvert(false)
    }
    setPlayerSortBy(event.target.id)
  }
  function handlePlayerClick(event) {
      setSelectedPlayer(event.target.id)
  }


  ///////////////////////////////////////////////////////////////////////////////
  // State for the "top cards in archetype" widget.
  ///////////////////////////////////////////////////////////////////////////////
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

  ///////////////////////////////////////////////////////////////////////////////
  // State used for tracking which widgets to display.
  // Each widget is represented as an element in the array, and defaulted here.
  ///////////////////////////////////////////////////////////////////////////////
  const [display, setDisplay] = useState([true, false, false, false, false, false]);
  function onSubpageClicked(idx) {
    let d = {...display}
    if (d[idx]) {
      d[idx] = false
    } else {
      d[idx] = true
    }
    // Uncheck any other boxes to make sure we're only displaying
    // one widget set at a time.
    for (var i in d) {
      if (i != idx) {
        d[i] = false
      }
    }
    setDisplay(d)

    // Clear any state that may have been set on a previous page to avoid
    // accidental filtering of data based on invisible UI elements.
    setColorCheckboxes([false, false, false, false, false])
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

  // Load the decks and drafts on startup and whenever the dates change.
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

    // Build option for the archetype dropdown.
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

    if (awaitingLoad) {
      // Now that we have loaded all decks for the first time, we can default the
      // start date to the first draft, and the end date to the latest draft.
      setStartDate(d[0].date)
      setEndDate(d[d.length - 1].date)
      setAwaitingLoad(false)
    }
  }
  function onCubeLoad(c) {
    setCube({...c})
  }
  function onDraftsLoaded(d) {
    // Save the drafts.
    setDrafts({...d})

    // Update the draft dropdown.
    let draftDates = [{label: "", value: ""}]
    for (let draft of d) {
      if (draft.type != "Draft") {
        // Skip drafts that we don't know how to parse for now.
        // e.g., Grid drafts.
        continue
      }

      draftDates.push({
        label: draft.date,
        value: draft.date,
      })
    }
    setDraftLogs(draftDates)
  }

  // Get archetype matchup data.
  function onArchetypeDataLoaded(a) {
    setArchetypeMatchups(a)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // Perform occasional calculation up-front.
  // Build a bundle of parsed data to pass to widgets so that we only need
  // to calculate it once.
  ///////////////////////////////////////////////////////////////////////////////
  const defaultParsed = {
    "filteredDecks": [],
    "archetypeData": [],
    "colorData": [],
    "deckBuckets": [],
    "playerData": [],
    "cardData": {},
    "pickInfo": {},
  }
  const [parsed, setParsedData] = useState(defaultParsed);
  function parse() {
    // Filter decks based on selected colors. This enables us to view data for a subset of colors.
    // Combine the colors using a logical AND to enable us to view two-color decks. If no colors are selected,
    // then use all decks.
    let f = decks
    let filterByColor = colorCheckboxes.some(function(element) {return element})
    if (filterByColor) {
      f = []
      let enabledColors = checkboxesToColors(colorCheckboxes)
      for (let deck of decks) {
        let deckMatches = true
        for (let color of enabledColors) {
          if (!deck.colors.includes(color)) {
            deckMatches = false
            break
          }
        }
        if (deckMatches) {
          f.push(deck)
        }
      }
    }

    // Build the parsed data structure.
    let p = {}
    p.filteredDecks = f
    p.archetypeData = ArchetypeData(f)
    p.colorData = GetColorStats(f, strictColors)
    p.playerData = PlayerData(f)
    p.cardData = CardData(f, minDrafts, minGames, cube, cardWidgetColorSelection)
    p.bucketSize = bucketSize
    p.pickInfo = AggregatedPickInfo(drafts, cube, playerMatch)

    // Split the given decks into fixed-size buckets.
    // Each bucket will contain N drafts worth of deck information. We'll parse each bucket
    // individually, which is used by other pages to plot stats over time.
    p.deckBuckets = DeckBuckets(f, bucketSize, false)
    for (let b of p.deckBuckets) {
      // Determine all of the decks in this bucket.
      let bucketDecks = new Array()
      for (let draft of b) {
        bucketDecks = bucketDecks.concat(draft.decks)
      }

      // Add per-bucket parsed data.
      b.archetypeData = ArchetypeData(bucketDecks)
      b.colorData = GetColorStats(bucketDecks, strictColors)
      b.playerData = PlayerData(bucketDecks)
      b.cardData = CardData(bucketDecks, 0, 0, cube, "")
    }

    // Also go through each player and parse stats individually for them.
    for (let d of p.playerData.values()) {
      d.archetypeData = ArchetypeData(d.decks)
      d.colorData = GetColorStats(d.decks, strictColors)
    }

    setParsedData(p)
  }
  useEffect(() => {
    console.time('parse()')
    parse()
    console.timeEnd('parse()')
  }, [decks, bucketSize, minDrafts, minGames, cube, cardWidgetColorSelection, colorCheckboxes, strictColors])

  return (
    <div id="root">
      <SelectorBar
        triggerRefresh={triggerRefresh}
        startDate={startDate}
        onStartSelected={onStartSelected}
        endDate={endDate}
        onEndSelected={onEndSelected}
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
      />


      <div id="widgets" className="house-for-widgets">
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
          decks={parsed.filteredDecks}
          show={display[3]}
          bucketSize={bucketSize}

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
    </tr>
    </tbody>
  </table>
  );
}

function InitialDates() {
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
    drafts.set(input.decks[i].date, true)
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

function checkboxesToColors(checkboxes) {
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

