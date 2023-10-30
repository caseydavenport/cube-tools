import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadCube, LoadDecks, LoadDrafts} from "../utils/Fetch.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { AllPicks, Pick } from "../utils/DraftLog.js"
import { Wins, Losses } from "../utils/Deck.js"
import { CardData } from "../utils/Cards.js"
import { GetColorStats, ColorWidget} from "./Colors.js"
import { ArchetypeWidget, ArchetypeData } from "./Types.js"

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks, and the cube.
  const [decks, setDecks] = useState(null);
  const [cube, setCube] = useState(null);

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the color / color pair win rate widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [colorData, setColorData] = useState(null);
  const [colorTypeSelection, setColorTypeSelection] = useState("Mono");
  const [colorSortBy, setColorSortBy] = useState("win");
  const ddOpts =  [{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]
  function onSelected(event) {
    setColorTypeSelection(event.target.value)
  }
  function onColorHeaderClicked(event) {
    setColorSortBy(event.target.id)
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

  // When the deck list changes, recalculate.
  useEffect(() => {
    if (decks != null) {
      let w = GetColorStats(decks)
      setColorData(w)
    }
  }, [decks])

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
          colorData={colorData}
          onHeaderClick={onColorHeaderClicked}
          colorSortBy={colorSortBy}
          show={display[0]}
        />

        <ArchetypeWidget
          cube={cube}
          decks={decks}
          show={display[1]}

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

        <DeckAnalyzerWidget
          decks={decks}
          show={display[3]}
        />

        <PlayerWidget
          decks={decks}
          sortBy={playerSortBy}
          invertSort={playerSortInvert}
          onHeaderClick={onPlayerHeaderClicked}
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

function PlayerWidget(input) {
  if (!input.show) {
    return null
  }

  // Go through each deck and build up information about what each player picks.
  let map = new Map()
  for (var i in input.decks) {
    let deck = input.decks[i]
    let player = deck.player
    if (!map.has(player)) {
      // Player not seen yet - initialize.
      map.set(player, {
        name: player,
        numDecks: 0,
        cards: new Map(),
        totalPicks: 0,
        whitePicks: 0,
        bluePicks: 0,
        greenPicks: 0,
        blackPicks: 0,
        redPicks: 0,
        wins: 0,
        losses: 0,
      })
    }

    // Add per-deck data here. Like win / loss count.
    map.get(player).wins += Wins(deck)
    map.get(player).losses += Losses(deck)
    map.get(player).numDecks += 1

    // Go through each card and increase the player's per-card stats.
    for (var j in deck.mainboard) {
      let card = deck.mainboard[j]
      if (IsBasicLand(card)) {
        continue
      }

      // Add this card to the player.
      if (!map.get(player).cards.has(card.name)) {
        map.get(player).cards.set(card.name, {
          name: card.name,
          count: 0
        })
      }
      map.get(player).cards.get(card.name).count += 1
      map.get(player).totalPicks += 1

      // Perform per-color per-card actions.
      for (var c in card.colors) {
        let color = card.colors[c]
        switch(color) {
          case "W":
            map.get(player).whitePicks += 1
            break;
          case "U":
            map.get(player).bluePicks += 1
            break;
          case "B":
            map.get(player).blackPicks += 1
            break;
          case "R":
            map.get(player).redPicks += 1
            break;
          case "G":
            map.get(player).greenPicks += 1
            break;
        }
      }
    }
  }

  // Convert the mapped data into a list of rows to display - one per player.
  let data = []
  for (let row of map.values()) {
    // First, calculate a percentage of this player's total picks for each color.
    row.whitePercent = Math.round(row.whitePicks / row.totalPicks * 100)
    row.bluePercent = Math.round(row.bluePicks / row.totalPicks * 100)
    row.blackPercent = Math.round(row.blackPicks / row.totalPicks * 100)
    row.redPercent = Math.round(row.redPicks / row.totalPicks * 100)
    row.greenPercent = Math.round(row.greenPicks / row.totalPicks * 100)

    // Add in win and loss percentages.
    row.winPercent = Math.round(row.wins / (row.wins + row.losses) * 100)
    row.lossPercent = Math.round(row.losses / (row.wins + row.losses) * 100)
    row.games = row.wins + row.losses

    // Calculate the average re-pick value for this player by summing up the total
    // number of unique cards mainboarded by the player, divided by the total number cards picked. This is
    // a representation of how diverse this player's card selection is. A higher number indicates a propensity
    // to pick unique cards. A value of 1 means they have never picked the same card twice.
    row.uniqueness = Math.round(row.cards.size / row.totalPicks * 100)

    data.push(row)
  }

  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Player</td>
            <td onClick={input.onHeaderClick} id="decks" className="header-cell"># Decks</td>
            <td onClick={input.onHeaderClick} id="games" className="header-cell"># Games</td>
            <td onClick={input.onHeaderClick} id="wins" className="header-cell">Wins (%)</td>
            <td onClick={input.onHeaderClick} id="losses" className="header-cell">Losses (%)</td>
            <td onClick={input.onHeaderClick} id="W" className="header-cell">White (%)</td>
            <td onClick={input.onHeaderClick} id="U" className="header-cell">Blue (%)</td>
            <td onClick={input.onHeaderClick} id="B" className="header-cell">Black (%)</td>
            <td onClick={input.onHeaderClick} id="R" className="header-cell">Red (%)</td>
            <td onClick={input.onHeaderClick} id="G" className="header-cell">Green (%)</td>
            <td onClick={input.onHeaderClick} id="unique" className="header-cell">Uniqueness (%)</td>
          </tr>
        </thead>
        <tbody>
        {
          data.map(function(row) {
            // Determine sort value for this row.
            let sort = row.name
            switch(input.sortBy) {
              case "wins":
                sort = row.winPercent
                break;
              case "losses":
                sort = row.lossPercent
                break;
              case "games":
                sort = row.games
                break;
              case "W":
                sort = row.whitePercent
                break
              case "U":
                sort = row.bluePercent
                break
              case "B":
                sort = row.blackPercent
                break
              case "R":
                sort = row.redPercent
                break
              case "G":
                sort = row.greenPercent
                break
              case "unique":
                sort = row.uniqueness
                break
              case "decks":
                sort = row.numDecks
                break
            }
            if (input.invertSort) {
              sort = -1 * sort
            }
            return (
              <tr sort={sort} className="card" key={row.name}>
                <td>{row.name}</td>
                <td>{row.numDecks}</td>
                <td>{row.games}</td>
                <td>{row.winPercent}%</td>
                <td>{row.lossPercent}%</td>
                <td>{row.whitePercent}%</td>
                <td>{row.bluePercent}%</td>
                <td>{row.blackPercent}%</td>
                <td>{row.redPercent}%</td>
                <td>{row.greenPercent}%</td>
                <td>{row.cards.size} / {row.totalPicks} ({row.uniqueness}%)</td>
              </tr>
            )
          }).sort(SortFunc)
        }
        </tbody>
      </table>
    </div>
  );

}

// DeckAnalyzerWidget goes through all of the decks and finds decks that share a large number
// of cards in order to determine how many different decks have been built across a series of drafts.
// Decks that share enough cards get counted as the same deck.
function DeckAnalyzerWidget(input) {
  if (!input.show) {
    return null
  }
  let decks = new Map()
  let decklist = []

  // Pre-seed the decks map. This map will contain the final result of canonical decks.
  for (var i in input.decks) {
    let deck = input.decks[i]
    deck.count = 1
    deck.matches = new Array()
    decks.set(deck.file, deck)
  }

  // Compare each deck to the set of decks we've already looked at to see
  // if it matches sufficiently to be considered the same deck.
  for (i in input.decks) {
    let deck = input.decks[i]

    // Compare to existing decks.
    for (let deckTwo of decks.values()) {
      if (deck.file === deckTwo.file) {
        continue
      }

      // Track matches and total cards.
      let hits = 0
      let total = 0
      let sharedCards = new Array()

      // Go through each card in the deck, and compare to the decklist in the existing set.
      // If more than 75% of non-land cards match, it's considered the same deck.
      for (var k in deck.mainboard) {
        let card = deck.mainboard[k]
        if (IsBasicLand(card)) {
          continue
        }

        total += 1

        // Check if this card is in the deck we're comparing it to.
        for (var l in deckTwo.mainboard) {
          let cardTwo = deckTwo.mainboard[l]
          if (IsBasicLand(card)) {
            continue
          }

          if (cardTwo.name === card.name) {
            // Same card. Increment the match counter.
            hits += 1
            sharedCards.push(card)
          }
        }
      }

      // If more than 75% match, mark it as a match and increment the counter for this deck.
      let matchiness = hits / total
      if (matchiness > .40) {
        // Increment the first deck by the second deck's count, and delete the second deck.
        // Essentially, aggregate the decks into one entry.
        if (!deckTwo.matches.includes(deck.file) && !deck.matches.includes(deckTwo.file)) {
          deck.count += 1
          deck.matches.push(deckTwo.file)
          deck.sharedCards = sharedCards // TODO: Per matching deck...
          decks.set(deck.file, deck)

          deckTwo.count += 1
          deckTwo.sharedCards = sharedCards // TODO: Per matching deck...
          deckTwo.matches.push(deck.file)
          decks.set(deckTwo.file, deckTwo)
        }
      }
    }
  }

  // Convert to a list for sorting purposes.
  for (let aggDeck of decks.values()) {
    if (aggDeck.count > 1 ) {
      decklist.push(aggDeck)
    }
  }

  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td>{decklist.length} commonly built</td>
            <td># Builds</td>
            <td>Similar</td>
            <td>Core</td>
          </tr>
        </thead>
        <tbody>
          {
            decklist.map(function(deck) {

              let cards = []
              for (var c of deck.sharedCards.values()) {
                cards.push(c.name.substring(0, 20))
              }
              let cardString = cards.slice(0, 10).join(" / ")

              return (
                <tr sort={deck.count} className="card" key={deck.file}>
                  <td>{deck.file}</td>
                  <td>{deck.count}</td>
                  <td>{deck.matches.join(" -- ").substring(0, 60)}</td>
                  <td>{cardString}</td>
                </tr>
            )}).sort(SortFunc)
          }
        </tbody>
      </table>
      </div>
  );
}


function DraftOrderWidget(input) {
  if (!input.show) {
    return null
  }
  if (input.drafts == null) {
    return null
  }
  let picks = AllPicks(input.drafts, input.cube)
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
                  <td>{pick.count}</td>
                  <td>{firstPicks}</td>
                  <td>{avgPack1Pick}</td>
                  <td>{avgPackPick}</td>
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
    <div className="dropdown-header">
      <DropdownHeader
        label="Stats type"
        options={input.cardWidgetOpts}
        value={input.colorTypeSelection}
        onChange={input.onSelected}
        className="dropdown-header-side-by-side"
      />

      <DropdownHeader
        label="Color"
        options={input.colorWidgetOpts}
        value={input.colorSelection}
        onChange={input.onColorSelected}
        className="dropdown-header-side-by-side"
      />
      <br></br>

      <NumericInput
        label="Min #picks"
        value={input.minDrafts}
        onChange={input.onMinDraftsSelected}
      />

      <NumericInput
        label="Min #games"
        value={input.minGames}
        onChange={input.onMinGamesSelected}
      />
      <br></br>

      <NumericInput
        label="Min #players"
        value={input.minPlayers}
        onChange={input.onMinPlayersSelected}
      />

      <NumericInput
        label="Max #players"
        value={input.maxPlayers}
        onChange={input.onMaxPlayersSelected}
      />
    </div>
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
              let hidden = TooltipContent(card)
              return (
                <tr sort={card.mainboard_percent} className="card" key={card.name}>
                  <td>{card.mainboard_percent}%</td>
                  <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td><ApplyTooltip text={card.mainboard} hidden={hidden}/></td>
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
              <td onClick={input.onHeaderClick} id="norm" className="header-cell">Normalized</td>
            </tr>
          </thead>
          <tbody>
            {
              data.map(function(card) {
                // For each card, determine the weighted average of the archetype win rates for the
                // archetypes that it sees play in. We'll use this to normalize the card's win rate compared
                // to its own archetype win rates.
                let weightedBaseRate = 0
                let normalized = 0

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
                  // Assuming this card has been played, normalize the card's win rate vs. the expected win rate based on its archetypes.
                  normalized = Math.round(card.win_percent / weightedBaseRate * 100) / 100
                }

                // Determine sort value. Default to win percentage.
                let sort = card.win_percent
                switch (input.sortBy) {
                  case "norm":
                    sort = normalized
                }

                // Return the row.
                return (
                  <tr sort={sort} className="card" key={card.name}>
                    <td>{card.win_percent}%</td>
                    <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                    <td>{card.mainboard}</td>
                    <td>{card.total_games}</td>
                    <td>{normalized}</td>
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

function TooltipContent(card) {
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
