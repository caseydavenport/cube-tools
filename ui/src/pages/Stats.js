import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadCube, LoadDecks, LoadDrafts} from "../utils/Fetch.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { AggregatedPickInfo } from "../utils/DraftLog.js"
import { Wins, Losses } from "../utils/Deck.js"
import { CardData } from "../utils/Cards.js"
import { ColorWidget} from "./Colors.js"
import { ArchetypeWidget, ArchetypeData } from "./Types.js"
import { DeckWidget } from "./Decks.js"
import { PlayerWidget } from "./Players.js"
import { CardWidget } from "./Cards.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { DeckBuckets } from "../utils/Buckets.js"
import { GetColorStats } from "./Colors.js"
import { PlayerData } from "./Players.js"

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks, and the cube.
  const [decks, setDecks] = useState([]);
  const [cube, setCube] = useState({"cards": []});

  ///////////////////////////////////////////////////////////////////////////////
  // State used for all widgets.
  ///////////////////////////////////////////////////////////////////////////////
  const [bucketSize, setNumBuckets] = useState(5);
  function onBucketsChanged(event) {
    let num = event.target.value
    if (num < 1) {
      num = 1
    }
    setNumBuckets(num)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the color / color pair win rate widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [colorTypeSelection, setColorTypeSelection] = useState("Mono");
  const [colorSortBy, setColorSortBy] = useState("win");
  const [colorCheckboxes, setColorCheckboxes] = useState([false, false, false, false, false]);
  const ddOpts =  [{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]
  function onSelected(event) {
    setColorTypeSelection(event.target.value)
  }
  function onColorHeaderClicked(event) {
    setColorSortBy(event.target.id)
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

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the draft states tab.
  ///////////////////////////////////////////////////////////////////////////////
  const [drafts, setDrafts] = useState(null);
  const [draftSortBy, setDraftSortBy] = useState("p1p1");
  const [draftSortInvert, setDraftSortInvert] = useState(false);
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
  function onCheckbox(idx) {
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
  function onColorCheckbox() {
    onCheckbox(0)
  }
  function onArchetypeCheckbox() {
    onCheckbox(1)
  }
  function onCardCheckbox() {
    onCheckbox(2)
  }
  function onDeckCheckbox() {
    onCheckbox(3)
  }
  function onDraftCheckbox() {
    onCheckbox(4)
  }
  function onPlayersCheckbox() {
    onCheckbox(5)
  }

  // Load the decks and drafts on startup and whenever the dates change.
  useEffect(() => {
    LoadDecks(onLoad, startDate, endDate)
    LoadDrafts(onDraftsLoaded, startDate, endDate)
  }, [startDate, endDate])
  useEffect(() => {
    LoadCube(onCubeLoad)
  }, [decks])

  function onLoad(d) {
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
  }
  function onCubeLoad(c) {
    setCube({...c})
  }
  function onDraftsLoaded(d) {
    setDrafts({...d})
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
    "cardData": []
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
    p.colorData = GetColorStats(f)
    p.playerData = PlayerData(f)
    p.cardData = CardData(f, minDrafts, minGames, cube, cardWidgetColorSelection)

    // Split the given decks into fixed-size buckets.
    // Each bucket will contain N drafts worth of deck information. We'll parse each bucket
    // individually, which is used by other pages to plot stats over time.
    p.deckBuckets = DeckBuckets(f, bucketSize)
    for (let b of p.deckBuckets) {
      // Determine all of the decks in this bucket.
      let bucketDecks = new Array()
      for (let draft of b) {
        bucketDecks = bucketDecks.concat(draft.decks)
      }

      // Add per-bucket parsed data.
      b.archetypeData = ArchetypeData(bucketDecks)
      b.colorData = GetColorStats(bucketDecks)
      b.playerData = PlayerData(f)
    }

    // Also go through each player and parse stats individually for them.
    for (let d of p.playerData.values()) {
      d.archetypeData = ArchetypeData(d.decks)
      d.colorData = GetColorStats(d.decks)
    }

    setParsedData(p)
  }
  useEffect(() => {
    console.log("Parsing the loaded data")
    parse()
  }, [decks, bucketSize, minDrafts, minGames, cube, cardWidgetColorSelection, colorCheckboxes])

  return (
    <div id="root">
      <div id="selectorbar">
        <DateSelector
          label="From: "
          id="from"
          value={startDate}
          onChange={onStartSelected}
        />
        <DateSelector
          label="To: "
          id="to"
          value={endDate}
          onChange={onEndSelected}
        />

        <NumericInput className="dropdown" label="Bucket size" value={bucketSize} onChange={onBucketsChanged} />

        <Overview decks={parsed.filteredDecks} />

        <Checkbox
          text="Colors"
          checked={display[0]}
          onChange={onColorCheckbox}
        />
        <Checkbox
          text="Types"
          checked={display[1]}
          onChange={onArchetypeCheckbox}
        />
        <Checkbox
          text="Cards"
          checked={display[2]}
          onChange={onCardCheckbox}
        />
        <Checkbox
          text="Decks"
          checked={display[3]}
          onChange={onDeckCheckbox}
        />
        <Checkbox
          text="Drafts"
          checked={display[4]}
          onChange={onDraftCheckbox}
        />
        <Checkbox
          text="Players"
          checked={display[5]}
          onChange={onPlayersCheckbox}
        />
      </div>

      <div id="widgets" className="house-for-widgets">
        <ColorWidget
          parsed={parsed}
          ddOpts={ddOpts}
          colorTypeSelection={colorTypeSelection}
          onSelected={onSelected}
          decks={parsed.filteredDecks}
          onHeaderClick={onColorHeaderClicked}
          colorSortBy={colorSortBy}
          bucketSize={bucketSize}
          show={display[0]}
        />

        <ArchetypeWidget
          parsed={parsed}
          decks={decks}
          cube={cube}
          show={display[1]}
          bucketSize={bucketSize}

          dropdownSelection={colorTypeSelection}
          cardWidgetSelection={cardWidgetSelection}

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
          cardWidgetOpts={cardWidgetOpts}
          onSelected={onCardWidgetSelected}
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
          sortBy={cardWidgetSortBy}
          cube={cube}
          show={display[2]}
        />

        <UndraftedWidget
          parsed={parsed}
          cube={cube}
          decks={parsed.filteredDecks}
          show={display[2]}
        />

        <DraftOrderWidget
          parsed={parsed}
          decks={parsed.filteredDecks}
          drafts={drafts}
          cube={cube}
          sortBy={draftSortBy}
          invertSort={draftSortInvert}
          onHeaderClick={onDraftHeaderClicked}
          show={display[4]}
        />

        <DeckWidget
          parsed={parsed}
          decks={parsed.filteredDecks}
          show={display[3]}
          bucketSize={bucketSize}
        />

        <PlayerWidget
          parsed={parsed}
          decks={parsed.filteredDecks}
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

function InitialDates() {
  // Create a new Date object for today to represent the end date.
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() + 1; // Months are 0-indexed, so we add 1
  let day = today.getDate();
  const end = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  // Now build the start date, which is minus 4 months.
  let startDate = new Date(today);
  startDate.setMonth(month - 4)
  month = startDate.getMonth() + 1
  const start = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  return [start, end]
}

function DraftOrderWidget(input) {
  if (!input.show) {
    return null
  }
  if (input.drafts == null) {
    return null
  }
  let picks = AggregatedPickInfo(input.drafts, input.cube)
  let pickList = []
  for (let [name, pick] of picks) {
    pickList.push(pick)
  }

  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Card name</td>
            <td onClick={input.onHeaderClick} id="count" className="header-cell"># Drafts</td>
            <td onClick={input.onHeaderClick} id="p1p1" className="header-cell"># P1P1</td>
            <td onClick={input.onHeaderClick} id="avgp1pick" className="header-cell">Avg. p1 pick</td>
            <td onClick={input.onHeaderClick} id="avgpick" className="header-cell">Avg. pick</td>
            <td onClick={input.onHeaderClick} id="stddev" className="header-cell">Pick deviation</td>
            <td onClick={input.onHeaderClick} id="p1burn" className="header-cell"># P1 Burns</td>
            <td onClick={input.onHeaderClick} id="burn" className="header-cell"># Burns</td>
          </tr>
        </thead>
        <tbody>
          {
            pickList.map(function(pick) {
              let avgPackPick = "-"
              if (pick.count > 0) {
                avgPackPick = Math.round(pick.pickNumSum / pick.count * 100) / 100
              }

              let avgPack1Pick = "-"
              if (pick.p1count > 0) {
                avgPack1Pick = Math.round(pick.p1PickNumSum / pick.p1count * 100) / 100
              }

              let firstPicks = "-"
              if (pick.firstPicks > 0) {
                firstPicks = pick.firstPicks
              }

              let burns = "-"
              if (pick.burns > 0) {
                burns = pick.burns
              }

              let p1burns = "-"
              if (pick.p1burns > 0) {
                p1burns = pick.p1burns
              }

              // Calculate the standard deviation for this card.
              let sumOfSquares = 0
              for (let p of pick.picks) {
                let diff = avgPackPick - p.pick
                sumOfSquares += diff*diff
              }
              let stddev = Math.round(Math.sqrt(sumOfSquares / pick.count)*10) / 10

              let sort = pick.count
              if (input.sortBy === "p1p1") {
                sort = pick.firstPicks
              } else if (input.sortBy === "avgp1pick") {
                sort = avgPack1Pick
              } else if (input.sortBy === "avgpick") {
                sort = avgPackPick
              } else if (input.sortBy === "burn") {
                sort = pick.burns
              } else if (input.sortBy === "p1burn") {
                sort = pick.p1burns
              } else if (input.sortBy === "name") {
                sort = pick.name
              } else if (input.sortBy === "count") {
                sort = pick.count
              } else if (input.sortBy === "stddev") {
                sort = stddev
              }

              if (sort == "-") {
                // Treat empty values as last always. That means a negataive number
                // for normal sorting, and a big positive one for inverted sorting.
                sort = -1
                if (input.invertSort) {
                  sort = 100000
                }
              }

              if (input.invertSort) {
                sort = -1 * sort
              }

              return (
                <tr sort={sort} className="card" key={pick.name}>
                  <td className="card"><a href={pick.card.url} target="_blank" rel="noopener noreferrer">{pick.name}</a></td>
                  <td><ApplyTooltip text={pick.count} hidden={DraftPickTooltipContent(pick)}/></td>
                  <td>{firstPicks}</td>
                  <td>{avgPack1Pick}</td>
                  <td>{avgPackPick}</td>
                  <td>{stddev}</td>
                  <td>{p1burns}</td>
                  <td>{burns}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
      </div>
  );
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
    drafts.set(input.decks[i].draft, true)
  }
  numDrafts = drafts.size

  return (
    <label className="dropdown">
      <label>Displaying stats for {numDrafts} drafts, {numDecks} decks</label>
    </label>
  )
}

function UndraftedWidget(input) {
  if (!input.show) {
    return null
  }
  let draftData = CardData(input.decks, input.minDrafts, input.minGames, input.cube, "")

  // Build a map of all the cards in the cube so we can
  // easily discard cards that have been drafted before.
  let cards = new Map()
  for (var i in input.cube.cards) {
    cards.set(input.cube.cards[i].name, input.cube.cards[i])
  }

  // Discard any cards that have been mainboarded.
  for (i in draftData) {
    if (draftData[i].mainboard > 0) {
      cards.delete(draftData[i].name)
    }
  }

  // All that's left are cards that have never been drafted.
  // Display them in a table. Make them an array first so we can sort.
  let cardArray = []
  let num = 0
  cards.forEach(function(i) {
    cardArray.push(i)
    num += 1
  })
  return (
    <div className="widget">
    <table className="winrate-table">
      <thead className="table-header">
        <tr>
          <td>{num} cards never mainboarded</td>
        </tr>
      </thead>
      <tbody>
      {
        cardArray.map(function(item) {
         return (
           <tr sort={item.mainboard_percent} className="card" key={item.name}>
             <td><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
           </tr>
         )
        })
      }
      </tbody>
    </table>
    </div>
  );
}

function PrintRow({ k, value, p }) {
  return (
    <tr key={k} className="winrate-row">
      <td key="k">{k}</td>
      <td key="p">{p}%</td>
      <td key="value">{value}</td>
    </tr>
  );
}

function DraftPickTooltipContent(pick) {
  let k = 0
  return (
    <div>
      <table>
        <thead className="table-header">
          <tr>
            <td id="name" className="header-cell">Date</td>
            <td id="name" className="header-cell">Player</td>
            <td id="pack" className="header-cell">Pack</td>
            <td id="pick" className="header-cell">Pick</td>
          </tr>
        </thead>
        <tbody>
        {
          pick.picks.map(function(pick) {
            k += 1
            return (
              <tr key={k}>
                <td>{pick.date}</td>
                <td>{pick.player}</td>
                <td>{pick.pack + 1}</td>
                <td>{pick.pick + 1}</td>
              </tr>
            )
          })
        }
        </tbody>
      </table>
    </div>
  )
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

