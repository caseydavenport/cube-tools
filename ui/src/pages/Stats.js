import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadCube, LoadDecks, IsBasicLand } from "../utils/Fetch.js"
import { DropdownHeader, Checkbox, DateSelector } from "../components/Dropdown.js"
import { GetColorIdentity } from "../utils/Colors.js"

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks, and the cube.
  const [decks, setDecks] = useState(null);
  const [cube, setCube] = useState(null);

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the color / color pair win rate widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [winrates, setWinrates] = useState(null);
  const [colorTypeSelection, setColorTypeSelection] = useState("Mono");
  const [colorSortBy, setColorSortBy] = useState("win");
  const ddOpts =  [{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]
  function onSelected(event) {
    setColorTypeSelection(event.target.value)
  }
  function onHeaderClicked(event) {
    setColorSortBy(event.target.id)
  }


  ///////////////////////////////////////////////////////////////////////////////
  // State used for the card widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [cardWidgetSelection, setCardWidgetSelection] = useState("Pick rate");
  const [minDrafts, setMinDrafts] = useState(0);
  const cardWidgetOpts =  [{ label: "Pick rate", value: "Pick rate" }, { label: "Win rate", value: "Win rate" }]
  const minDraftsOpts =  [
    { label: "0", value: 0 }, { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" },
    { label: "4", value: 4 }, { label: "5", value: "5" }, { label: "6", value: "6" }, { label: "7", value: "7" },
  ]
  function onCardWidgetSelected(event) {
    setCardWidgetSelection(event.target.value)
  }
  function onMinDraftsSelected(event) {
    setMinDrafts(event.target.value)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for time selection.
  ///////////////////////////////////////////////////////////////////////////////
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  function onStartSelected(event) {
    setStartDate(event.target.value)
  }
  function onEndSelected(event) {
    setEndDate(event.target.value)
  }

  ///////////////////////////////////////////////////////////////////////////////
  // State used for tracking which widgets to display.
  // Each widget is represented as an element in the array, and defaulted here.
  ///////////////////////////////////////////////////////////////////////////////
  const [display, setDisplay] = useState([true, true, false]);
  function onCheckbox(idx) {
    let d = {...display}
    if (d[idx]) {
      d[idx] = false
    } else {
      d[idx] = true
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

  // Load the decks on startup and whenever the dates change.
  useEffect(() => {
    LoadDecks(onLoad, startDate, endDate)
  }, [startDate, endDate])
  useEffect(() => {
    LoadCube(onCubeLoad)
  }, [])
  function onLoad(d) {
    setDecks({...d})
  }
  function onCubeLoad(c) {
    setCube({...c})
  }

  // When the deck list changes, recalculate.
  useEffect(() => {
    if (decks != null) {
      let w = GetWinrates(decks)
      setWinrates(w)
    }
  }, [decks])


  return (
    <div>
      <div>
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
      </div>

      <div className="house-for-widgets">
        <ColorWidget
          ddOpts={ddOpts}
          colorTypeSelection={colorTypeSelection}
          onSelected={onSelected}
          decks={decks}
          winrates={winrates}
          onHeaderClick={onHeaderClicked}
          colorSortBy={colorSortBy}
          show={display[0]}
        />

        <PopularArchetypeWidget
          decks={decks}
          dropdownSelection={colorTypeSelection}
          show={display[1]}
        />

        <SuccessfulArchetypeWidget
          decks={decks}
          dropdownSelection={colorTypeSelection}
          show={display[1]}
        />

        <CardWidget
          decks={decks}
          dropdownSelection={cardWidgetSelection}
          cardWidgetOpts={cardWidgetOpts}
          onSelected={onCardWidgetSelected}
          minDrafts={minDrafts}
          minDraftsOpts={minDraftsOpts}
          onMinDraftsSelected={onMinDraftsSelected}
          show={display[2]}
        />

        <UndraftedWidget cube={cube} decks={decks} show={display[2]}/>
      </div>

    </div>
  );
}

function SuccessfulArchetypeWidget(input) {
  if (!input.show) {
    return null
  }
  let data = ArchetypeData(input.decks)
  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td>Archetype</td>
            <td>Win rate</td>
            <td>Record</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map((t) => (
              <PrintRow
                key={t.type}
                k={t.type}
                value={t.record}
                p={t.win_percent}
                sort={t.win_percent}
              />
            )).sort(sortFunc)
          }
        </tbody>
      </table>
      </div>
  );
}


function PopularArchetypeWidget(input) {
  if (!input.show) {
    return null
  }
  let data = ArchetypeData(input.decks)
  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td>Archetype</td>
            <td>Build rate</td>
            <td># Decks</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map((t) => (
              <PrintRow
                key={t.type}
                k={t.type}
                value={t.count}
                p={t.build_percent}
                sort={t.build_percent}
              />
            )).sort(sortFunc)
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
  let draftData = CardData(input.decks, input.minDrafts)

  // Build a map of all the cards in the cube so we can
  // easily discard cards that have been drafted before.
  let cards = new Map()
  for (var i in input.cube.cards) {
    cards.set(input.cube.cards[i].name, input.cube.cards[i])
  }

  // Discard any cards that have been drafted.
  for (i in draftData) {
    cards.delete(draftData[i].name)
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
          <td>{num} undrafted cards</td>
        </tr>
      </thead>
      <tbody>
      {
        cardArray.map(function(item) {
         return (
           <tr sort={item.pick_percent} className="card" key={item.name}>
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


function CardWidget(input) {
  if (!input.show) {
    return null
  }
  let data = CardData(input.decks, input.minDrafts)
  if (input.dropdownSelection === "Pick rate") {
    return (
      <div className="widget">
        <div className="dropdown-header">
          <DropdownHeader
            label="Stats type"
            options={input.cardWidgetOpts}
            value={input.colorTypeSelection}
            onChange={input.onSelected}
            className="dropdown-header-side-by-side"
          />

          <DropdownHeader
            label="Min drafts"
            options={input.minDraftsOpts}
            value={input.minDrafts}
            onChange={input.onMinDraftsSelected}
            className="dropdown-header-side-by-side"
          />
        </div>

        <table className="winrate-table">
          <thead className="table-header">
            <tr>
              <td className="header-cell">Pick rate</td>
              <td className="header-cell">Card</td>
              <td className="header-cell"># Decks</td>
            </tr>
          </thead>
          <tbody>
          {
            data.map(function(item) {
              return (
                <tr sort={item.pick_percent} className="card" key={item.name}>
                  <td>{item.pick_percent}%</td>
                  <td><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
                  <td>{item.count}</td>
                </tr>
              )
            }).sort(sortFunc)
          }
          </tbody>
        </table>
      </div>
    );
  } else {
        let archetypeData = ArchetypeData(input.decks)
        return (
          <div className="widget">
            <div className="dropdown-header">
              <DropdownHeader
                label="Stats type"
                options={input.cardWidgetOpts}
                value={input.colorTypeSelection}
                onChange={input.onSelected}
                className="dropdown-header-side-by-side"
              />

              <DropdownHeader
                label="Min drafts"
                options={input.minDraftsOpts}
                value={input.minDrafts}
                onChange={input.onMinDraftsSelected}
                className="dropdown-header-side-by-side"
              />
            </div>

            <table className="winrate-table">
              <thead className="table-header">
                <tr>
                  <td className="header-cell">Win rate</td>
                  <td className="header-cell">Card</td>
                  <td className="header-cell"># Decks</td>
                  <td className="header-cell">Normalized</td>
                </tr>
              </thead>
              <tbody>
                {
                  data.map(function(item) {
                    // For each card, determine the weighted average of the archetype win rates for the
                    // archetypes that it sees play in. We'll use this to normalize the card's win rate compared
                    // to its own archetype win rates.
                    let weightedBaseRate = 0

                    // Determine the total number of instances of all archetypes this card has to use as the denominator when
                    // calculating weighted averages below.
                    let totalPicks = 0
                    for (var arch in item.archetypes) {
                      totalPicks += item.archetypes[arch]
                    }

                    // For each archetype, use the number of times it shows up for this card, the total number of instances of archetypes
                    // this card belongs to, and each archetype's average win rate in order to calculate a weighted average
                    // representing the expected win rate of the card.
                    for (arch in item.archetypes) {
                      let numArchDecks = item.archetypes[arch]
                      let archWinRate = 0
                      for (var i in archetypeData) {
                        if (archetypeData[i].type === arch) {
                          archWinRate = archetypeData[i].win_percent
                          break
                        }
                      }
                      let weight = numArchDecks / totalPicks
                      weightedBaseRate += weight * archWinRate
                    }

                    // Now, normalize the card's win rate vs. the expected win rate based on its archetypes.
                    let normalized = Math.round(item.win_percent / weightedBaseRate * 100) / 100

                    // Return the row.
                    return (
                      <tr sort={item.win_percent} className="card" key={item.name}>
                        <td>{item.win_percent}%</td>
                        <td><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
                        <td>{item.count}</td>
                        <td>{normalized}</td>
                      </tr>
                    )
                  }).sort(sortFunc)
                }
              </tbody>
            </table>
          </div>
        );
  }
}

function CardData(decks, minDrafts) {
  let tracker = {}
  let drafts = new Map()
  for (var i in decks) {
    let deck = decks[i]

    // Keep track of the total number of drafts.
    drafts.set(deck.draft, true)

    let cards = deck.mainboard
    for (var j in cards) {
      let card = cards[j]
      // Skip basic lands.
      if (IsBasicLand({card})) {
        continue
      }
      if (tracker[card.name] == null) {
        tracker[card.name] = {name: card.name, count: 0, wins: 0, losses: 0, url: card.url}
        tracker[card.name].archetypes = {}
      }
      tracker[card.name].count += 1
      tracker[card.name].wins += decks[i].wins
      tracker[card.name].losses += decks[i].losses

      // Include archetype data for this card, which allows us to map cards to archetypes
      // and compare their performance to other cards in the same archetype.
      for (var k in deck.labels) {
        const arch = deck.labels[k]
        if (!tracker[card.name].archetypes[arch]) {
          tracker[card.name].archetypes[arch] = 0
        }
        tracker[card.name].archetypes[arch] += 1
      }
    }
  }

  // Convert total number of drafts.
  let totalDrafts = drafts.size

  // Convert to a list for sorting.
  let data = []
  for (var c in tracker) {
    // Skip any cards that have only played in a single deck.
    let card = tracker[c]
    if (card.count < minDrafts) {
      continue
    }
    tracker[c].pick_percent = Math.round(card.count / totalDrafts * 100)
    tracker[c].win_percent = Math.round(card.wins / (card.wins + card.losses) * 100)
    tracker[c].record = card.wins + "-" + card.losses + "-" + 0
    data.push(tracker[c])
  }
  return data
}

function ArchetypeData(decks) {
  // First, determine the popularity of each archetype by iterating all decks
  // and counting the instances of each.
  let tracker = {}
  let totalDecks = 0
  for (var i in decks) {
    totalDecks += 1
    let types = decks[i].labels
    for (var j in types) {
      let type = types[j]
      if (tracker[type] == null) {
        tracker[type] = {type: type, count: 0, wins: 0, losses: 0}
      }
      tracker[type].count += 1
      tracker[type].wins += decks[i].wins
      tracker[type].losses += decks[i].losses
    }
  }

  // Convert to a list for sorting.
  let data = []
  for (var type in tracker) {
    tracker[type].build_percent = Math.round(tracker[type].count / totalDecks * 100)
    tracker[type].win_percent = Math.round(tracker[type].wins / (tracker[type].wins + tracker[type].losses) * 100)
    tracker[type].record = tracker[type].wins + "-" + tracker[type].losses + "-" + 0
    data.push(tracker[type])
  }
  return data
}

function ColorWidget(input) {
  if (!input.show) {
    return null
  }
  return (
      <div className="widget">
        <DropdownHeader
          label="Select color type"
          options={input.ddOpts}
          value={input.colorTypeSelection}
          onChange={input.onSelected}
        />

        <ColorWinratesWidget
          winrates={input.winrates}
          ddOpts={input.ddOpts}
          dropdownSelection={input.colorTypeSelection}
          decks={input.decks}
          onSelected={input.onSelected}
          onClick={input.onHeaderClick}
          sortBy={input.colorSortBy}
        />
      </div>
  );
}

// ColorWinratesWidget displays the win percentages and records by color.
function ColorWinratesWidget(input) {
  if (input == null || input.winrates == null) {
    return null
  }

  // First, determine the popularity of each color by iterating all decks
  // and counting the instances of each color, pair, and triome.
  let tracker = {}
  let totalDecks = 0
  let decks = input.decks
  for (var i in decks) {
    totalDecks += 1
    let colors = GetColorIdentity(decks[i])
    for (var j in colors) {
      let color = colors[j]
      if (tracker[color] == null) {
        tracker[color] = {color: color, count: 0}
      }
      tracker[color].count += 1
    }
  }
  for (var color in tracker) {
    tracker[color].percent = Math.round(tracker[color].count / totalDecks * 100)
  }



  // Iterate and calculate the actual win percentage for each.
  // Also, convert from a map to a list at this point so that we can
  // sort by win percentage.
  let wr = []
  for (color in input.winrates) {
    // If dual is set, only show dual colors.
    // Otherwise, only show single colors.
    // `color` here is a string made of one or more characters - e.g., W or UB.
    if (input.dropdownSelection === "Dual" && color.length !== 2) {
      continue
    } else if (input.dropdownSelection === "Mono" && color.length !== 1 ) {
      continue
    } else if (input.dropdownSelection === "Trio" && color.length !== 3) {
      continue
    }
    let ratesForColor = input.winrates[color]
    let wins = ratesForColor.wins
    let losses = ratesForColor.losses
    let p = Math.round(wins / (wins + losses) * 100)
    if ((wins + losses) === 0) {
      p = 0
    }
    ratesForColor.win_percent = p
    ratesForColor.build_percent = tracker[color].percent
    ratesForColor.num_decks = tracker[color].count
    ratesForColor.record = wins + "-" + losses + "-" + 0

    // Determine what we're sorting by. Default to sorting by win percentage.
    ratesForColor.sort = ratesForColor.win_percent
    if (input.sortBy === "build") {
      ratesForColor.sort = ratesForColor.build_percent
    } else if (input.sortBy === "decks") {
      ratesForColor.sort = ratesForColor.num_decks
    } else if (input.sortBy === "color") {
      ratesForColor.sort = ratesForColor.color
    }

    // Add it to the list.
    wr.push(ratesForColor)
  }

  return (
    <table className="winrate-table">
      <thead className="table-header">
        <tr>
          <td onClick={input.onClick} id="color" className="header-cell">Color</td>
          <td onClick={input.onClick} id="win" className="header-cell">Win rate</td>
          <td onClick={input.onClick} id="build" className="header-cell">Build rate</td>
          <td onClick={input.onClick} id="record" className="header-cell">Record</td>
          <td onClick={input.onClick} id="decks" className="header-cell"># Decks</td>
        </tr>
      </thead>
      <tbody>
        {
          wr.map((rates) => (
            <tr key={rates.color} sort={rates.sort} className="winrate-row">
              <td>{rates.color}</td>
              <td>{rates.win_percent}%</td>
              <td>{rates.build_percent}%</td>
              <td>{rates.record}</td>
              <td>{rates.num_decks}</td>
            </tr>
          )).sort(sortFunc)
        }
      </tbody>
    </table>
  );
}

// sortFunc compares winrates in order to
// sort the winrates table from most winning to least winning.
function sortFunc(a, b) {
  if (a.props.sort > b.props.sort) {
    return -1
  } else if (a.props.sort < b.props.sort) {
    return 1
  }
  return 0
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

function GetWinrates(decks) {
  // Go through each deck, and add its winrates to the color count.
  // Initialize winrates to zero first.
  let tracker = {}
  for (var i in decks) {
    let colors = GetColorIdentity(decks[i])
    for (var j in colors) {
      let color = colors[j]
      if (tracker[color] == null) {
        tracker[color] = {wins: 0, losses: 0, color: color}
      }
      tracker[color].wins += decks[i].wins
      tracker[color].losses += decks[i].losses
    }
  }
  return tracker
}
