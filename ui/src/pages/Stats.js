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

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks, and the cube.
  const [decks, setDecks] = useState(null);
  const [cube, setCube] = useState(null);

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
    { label: "Sideboard rate", value: "Sideboard rate" },
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
  }, [])
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

        <Overview decks={decks} />

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
          ddOpts={ddOpts}
          colorTypeSelection={colorTypeSelection}
          onSelected={onSelected}
          decks={decks}
          onHeaderClick={onColorHeaderClicked}
          colorSortBy={colorSortBy}
          bucketSize={bucketSize}
          show={display[0]}
        />

        <ArchetypeWidget
          cube={cube}
          decks={decks}
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
          decks={decks}
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
          cube={cube}
          decks={decks}
          show={display[2]}
        />

        <DraftOrderWidget
          decks={decks}
          drafts={drafts}
          cube={cube}
          sortBy={draftSortBy}
          invertSort={draftSortInvert}
          onHeaderClick={onDraftHeaderClicked}
          show={display[4]}
        />

        <BestCombosWidget
          cube={cube}
          decks={decks}
          show={display[2]}
        />

        <DeckWidget
          decks={decks}
          show={display[3]}
          bucketSize={bucketSize}
        />

        <PlayerWidget
          decks={decks}
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
                  <td className="card">{pick.name}</td>
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

function BestCombosWidget(input) {
  if (!input.show) {
    return null
  }

  let combos = new Map()

  // Build up all of the two-card combinations across all decks.
  let alreadyCounted = {}
  for (var i in input.decks) {
    let deck = input.decks[i]
    let cards = deck.mainboard
    for (var j in cards) {
      let card = cards[j]
      if (IsBasicLand(card)) {
        continue
      }

      for (var k in cards) {
        let cardtwo = cards[k]
        if (IsBasicLand(cardtwo)) {
          continue
        }
        if (cardtwo === card) {
          continue
        }

        // Add this decks stats to the pairing.
        let key = [card.name, cardtwo.name].sort().join(" + ")
        if (!combos[key]) {
          combos[key] = {key: key, wins: 0, losses: 0, decks: 0}
        }

        // Skip this deck if we've already counted this combo within it.
        let deckKey = deck.file + key
        if (alreadyCounted[deckKey]) {
          continue
        }
        combos[key].wins += Wins(deck)
        combos[key].losses += Losses(deck)
        combos[key].decks += 1
        alreadyCounted[deckKey] = true
      }
    }
  }


  // Go through all the pairs and calculate additional stats, now that we've aggregated them.
  // We only include combinations that meet number-of-decks minimum, to ensure we're looking at
  // combintations that are commonly drafted together.
  let cardArray = []
  let num = 0
  for (i in combos) {
    let combo = combos[i]
    if (combo.decks >= 5) {
      combos[i].win_pct = Math.round(100 * combos[i].wins / (combos[i].wins + combos[i].losses))
      cardArray.push(combos[i])
      num += 1
    }
  }
  return (
    <div className="widget">
    <table className="winrate-table">
      <thead className="table-header">
        <tr>
          <td className="header-cell">{num} commonly seen combos</td>
          <td className="header-cell">Win rate</td>
          <td className="header-cell"># Decks</td>
        </tr>
      </thead>
      <tbody>
      {
        cardArray.map(function(item) {
         return (
           <tr sort={item.win_pct} className="card" key={item.key}>
             <td>{item.key}</td>
             <td>{item.win_pct}%</td>
             <td>{item.decks}</td>
           </tr>
         )
        }).sort(SortFunc)
      }
      </tbody>
    </table>
    </div>
  );

}


function CardWidgetOptions(input) {
  return (
    <table className="dropdown-header">
      <tbody>
        <tr>
          <td className="selection-cell">
            <DropdownHeader
              label="Stats type"
              options={input.cardWidgetOpts}
              value={input.colorTypeSelection}
              onChange={input.onSelected}
              className="dropdown-header-side-by-side"
            />
          </td>

          <td className="selection-cell">
            <DropdownHeader
              label="Color"
              options={input.colorWidgetOpts}
              value={input.colorSelection}
              onChange={input.onColorSelected}
              className="dropdown-header-side-by-side"
            />
          </td>
        </tr>

        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min #picks"
              value={input.minDrafts}
              onChange={input.onMinDraftsSelected}
              className="dropdown-header-side-by-side"
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Min #games"
              value={input.minGames}
              onChange={input.onMinGamesSelected}
              className="dropdown-header-side-by-side"
            />
          </td>
        </tr>

        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min #players"
              value={input.minPlayers}
              onChange={input.onMinPlayersSelected}
              className="dropdown-header-side-by-side"
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Max #players"
              value={input.maxPlayers}
              onChange={input.onMaxPlayersSelected}
              className="dropdown-header-side-by-side"
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function CardWidget(input) {
  if (!input.show) {
    return null
  }
  let data =[]
  let raw = CardData(input.decks, input.minDrafts, input.minGames, input.cube, input.colorSelection)
  raw.map(function(card) {
    if (card.players.size < input.minPlayers) {
      return
    }
    if (input.maxPlayers != 0 && card.players.size > input.maxPlayers) {
      return
    }
    data.push(card)
  })

  if (input.dropdownSelection === "Mainboard rate") {
    return (
      <div className="widget">
        <CardWidgetOptions {...input} />
        <table className="winrate-table">
          <thead className="table-header">
            <tr>
              <td className="header-cell">Mainboard rate</td>
              <td className="header-cell">Card</td>
              <td className="header-cell"># Decks</td>
              <td className="header-cell"># Games</td>
            </tr>
          </thead>
          <tbody>
          {
            data.map(function(card) {
              return (
                <tr sort={card.mainboard_percent} className="card" key={card.name}>
                  <td>{card.mainboard_percent}%</td>
                  <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td><ApplyTooltip text={card.mainboard} hidden={CardMainboardTooltipContent(card)}/></td>
                  <td>{card.total_games}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
          </tbody>
        </table>
      </div>
    );
  } else if (input.dropdownSelection === "Sideboard rate") {
    return (
      <div className="widget">
        <CardWidgetOptions {...input} />
        <table className="winrate-table">
          <thead className="table-header">
            <tr>
              <td className="header-cell">Sideboard rate</td>
              <td className="header-cell">Card</td>
              <td className="header-cell">#sb / #picked</td>
              <td className="header-cell"># in-color sb</td>
              <td className="header-cell"># Games</td>
            </tr>
          </thead>
          <tbody>
          {
            data.map(function(item) {
              return (
                <tr sort={item.sideboard_percent} className="card" key={item.name}>
                  <td>{item.sideboard_percent}%</td>
                  <td className="card"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
                  <td>{item.sideboard} / {item.mainboard + item.sideboard}</td>
                  <td>{item.inColorSideboard}</td>
                  <td>{item.total_games}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
          </tbody>
        </table>
      </div>
    );
  } else {
    let archetypeData = ArchetypeData(input.decks)
    return (
      <div className="widget">
        <CardWidgetOptions {...input} />
        <table className="winrate-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onHeaderClick} id="wins" className="header-cell">Win rate</td>
              <td onClick={input.onHeaderClick} id="card" className="header-cell">Card</td>
              <td onClick={input.onHeaderClick} id="decks" className="header-cell"># Decks</td>
              <td onClick={input.onHeaderClick} id="games" className="header-cell"># Games</td>
              <td onClick={input.onHeaderClick} id="perf" className="header-cell">Performance</td>
            </tr>
          </thead>
          <tbody>
            {
              data.map(function(card) {
                // For each card, determine the weighted average of the archetype win rates for the
                // archetypes that it sees play in. We'll use this to calculate the card's win rate compared
                // to its own archetype win rates.
                let weightedBaseRate = 0
                let relativePerf = 0

                // Determine the total number of instances of all archetypes this card has to use as the denominator when
                // calculating weighted averages below. The card.archetypes map has keys of the archetype name, and values of
                // the number of times it was seen in a deck of that archetype.
                let totalPicks = 0
                for (let num of card.archetypes.values()) {
                  totalPicks += num
                }

                // For each archetype, use the number of times it shows up for this card, the total number of instances of archetypes
                // this card belongs to, and each archetype's average win rate in order to calculate a weighted average
                // representing the expected win rate of the card.
                for (let [arch, numArchDecks] of card.archetypes) {
                  let archWinRate = 0

                  if (archetypeData.has(arch)) {
                    archWinRate = archetypeData.get(arch).win_percent
                  }
                  let weight = numArchDecks / totalPicks
                  weightedBaseRate += weight * archWinRate
                }

                if (card.mainboard > 0) {
                  // Assuming this card has been played, calculate the card's win rate vs. the expected win rate based on its archetypes.
                  relativePerf = Math.round(card.win_percent / weightedBaseRate * 100) / 100
                }

                // Determine sort value. Default to win percentage.
                let sort = card.win_percent
                switch (input.sortBy) {
                  case "perf":
                    sort = relativePerf
                }

                // Return the row.
                return (
                  <tr sort={sort} className="card" key={card.name}>
                    <td>{card.win_percent}%</td>
                    <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                    <td>{card.mainboard}</td>
                    <td><ApplyTooltip text={card.total_games} hidden={CardMainboardTooltipContent(card)}/></td>
                    <td>{relativePerf}</td>
                  </tr>
                )
              }).sort(SortFunc)
            }
          </tbody>
        </table>
      </div>
    );
  }
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

function CardMainboardTooltipContent(card) {
  let data = []
  card.players.forEach(function(num, name) {
    data.push({name: name, num: num})
  })
  return (
    <div>
      <table>
        <thead className="table-header">
          <tr>
            <td id="name" className="header-cell">Player</td>
            <td id="num" className="header-cell">#</td>
          </tr>
        </thead>
        <tbody>
        {
          data.map(function(row) {
            return (
              <tr sort={row.num} key={row.name}>
                <td>{row.name}</td>
                <td>{row.num}</td>
              </tr>
            )
          }).sort(SortFunc)
        }
        </tbody>
      </table>
    </div>
  )
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


function ApplyTooltip(input){
    return(
      <div className="tooltip-trigger">
        {input.text}
        <span className='tooltip'>
          {input.hidden}
        </span>
      </div>
    )
}
