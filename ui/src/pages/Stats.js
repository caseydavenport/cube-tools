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
  const [display, setDisplay] = useState([true, false, false, false]);
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
      let w = GetColorStats(decks)
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
        <Checkbox
          text="Decks"
          checked={display[3]}
          onChange={onDeckCheckbox}
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

        <TopCardsInArchetypeWidget
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

        <UndraftedWidget
          cube={cube}
          decks={decks}
          show={display[2]}
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
      </div>

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
      if (deck.file == deckTwo.file) {
        continue
      }

      // Track matches and total cards.
      let hits = 0
      let total = 0

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

          if (cardTwo.name == card.name) {
            // Same card. Increment the match counter.
            hits += 1
          }
        }
      }

      // If more than 75% match, mark it as a match and increment the counter for this deck.
      let matchiness = hits / total
      if (matchiness > .5) {
        // Increment the first deck by the second deck's count, and delete the second deck.
        // Essentially, aggregate the decks into one entry.
        if (!deckTwo.matches.includes(deck.file) && !deck.matches.includes(deckTwo.file)) {
          deck.count += 1
          deck.matches.push(deckTwo.file)
          deckTwo.matches.push(deck.file)
          decks.set(deck.file, deck)
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
          </tr>
        </thead>
        <tbody>
          {
            decklist.map((deck) => (
                <tr sort={deck.count} className="card" key={deck.file}>
                  <td>{deck.file}</td>
                  <td>{deck.count}</td>
                  <td>{deck.matches}</td>
                </tr>
            )).sort(sortFunc)
          }
        </tbody>
      </table>
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

function TopCardsInArchetypeWidget(input) {
  if (!input.show) {
    return null
  }
  let data = ArchetypeData(input.decks)
  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td className="header-cell">Archetype</td>
            <td className="header-cell">#1</td>
            <td className="header-cell">#2</td>
            <td className="header-cell">#3</td>
            <td className="header-cell">#4</td>
            <td className="header-cell">#5</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map(function(item) {
              // Get the top cards in the archetype by sorting.
              let cards = new Array()
              for (var i in item.cards) {
                cards.push(item.cards[i])
              }
              cards.sort(function(a, b) {
                if (a.num < b.num) {
                  return 1
                }
                return -1
              })
              return (
                <tr sort={item.win_percent} className="card" key={item.key}>
                  <td>{item.type}</td>
                  <td className="card"><a href={cards[0].card.url} target="_blank" rel="noopener noreferrer">{cards[0].card.name} ({cards[0].num})</a></td>
                  <td className="card"><a href={cards[1].card.url} target="_blank" rel="noopener noreferrer">{cards[1].card.name} ({cards[1].num})</a></td>
                  <td className="card"><a href={cards[2].card.url} target="_blank" rel="noopener noreferrer">{cards[2].card.name} ({cards[2].num})</a></td>
                  <td className="card"><a href={cards[3].card.url} target="_blank" rel="noopener noreferrer">{cards[3].card.name} ({cards[3].num})</a></td>
                  <td className="card"><a href={cards[4].card.url} target="_blank" rel="noopener noreferrer">{cards[4].card.name} ({cards[4].num})</a></td>
                </tr>
            )}).sort(sortFunc)
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
        combos[key].wins += deck.wins
        combos[key].losses += deck.losses
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
          <td className="header-cell">{num} combos</td>
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
        }).sort(sortFunc)
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
                  <td className="card"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
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
                        <td className="card"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
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
      if (IsBasicLand(card)) {
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
        let m = new Map()
        tracker[type] = {type: type, count: 0, wins: 0, losses: 0, cards: m}
      }
      tracker[type].count += 1
      tracker[type].wins += decks[i].wins
      tracker[type].losses += decks[i].losses

      // Include cards from this deck in the archetype for calculating the top
      // cards in each archetype.
      for (var k in decks[i].mainboard) {
        let card = decks[i].mainboard[k]
        if (IsBasicLand(card)) {
          continue
        }
        if (!tracker[type].cards[card.name]) {
          tracker[type].cards[card.name] = {card: card, num: 0}
        }
        tracker[type].cards[card.name].num += 1
      }
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

        <ColorStatsWidget
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

// ColorStatsWidget displays the win percentages and records by color.
function ColorStatsWidget(input) {
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
    } else if (input.sortBy === "picks") {
      ratesForColor.sort = ratesForColor.total_pick_percentage
    } else if (input.sortBy === "splash") {
      ratesForColor.sort = ratesForColor.average_deck_percentage
    }

    // Add it to the list.
    wr.push(ratesForColor)
  }

  // We conditionally show / hide a few of the columns, because they are only
  // applicable when mono-color is displayed.
  let headerStyleFields = {}
  if (input.dropdownSelection !== "Mono") {
    headerStyleFields.display = "none"
  }

  return (
    <table className="winrate-table">
      <thead className="table-header">
        <tr>
          <td onClick={input.onClick} id="color" className="header-cell">Color</td>
          <td onClick={input.onClick} id="win" className="header-cell">Deck win rate</td>
          <td onClick={input.onClick} id="build" className="header-cell">Deck build rate</td>
          <td onClick={input.onClick} id="record" className="header-cell">Record</td>
          <td onClick={input.onClick} id="decks" className="header-cell"># Decks</td>
          <td onClick={input.onClick} id="picks" className="header-cell" style={headerStyleFields}>% of picks</td>
          <td onClick={input.onClick} id="splash" className="header-cell" style={headerStyleFields}>% of deck</td>
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
              <td style={headerStyleFields}>{rates.total_pick_percentage}%</td>
              <td style={headerStyleFields}>{rates.average_deck_percentage}%</td>
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

function GetColorStats(decks) {
  // Go through each deck, and add its winrates to the color count.
  // Initialize winrates to zero first.
  let tracker = {}
  let totalCards = 0 // Count of all cards ever drafted.
  for (var i in decks) {

    // Start by adding metrics at the deck scope for color identity.
    // Add wins and losses contributed for each color / color combination within this deck.
    let colors = GetColorIdentity(decks[i])
    for (var j in colors) {
      let color = colors[j]
      if (tracker[color] == null) {
        tracker[color] = {
          color: color,
          wins: 0,
          losses: 0,
          cards: 0,
          // Each element represents a deck, with value equal to the
          // percentage of cards in that deck with this color.
          deck_percentages: [],
          // The average percentage of non-land cards in a deck that are this color.
          average_deck_percentage: 0,
          // The percentage of all drafted cards that are this color.
          total_pick_percentage: 0,
        }
      }
      tracker[color].wins += decks[i].wins
      tracker[color].losses += decks[i].losses
    }

    // Add metrics to the color based on card scope statistics.
    // Calculate the total number of cards drafted of the color across
    // all drafts, as well as the percentage of that color within the deck, which we'll
    // use to calculate an indicator of which colors are primary and whicn are splashed.
    let totalCardsInDeck = 0
    let cardsPerColorInDeck = {}
    for (j in decks[i].mainboard) {
      let card = decks[i].mainboard[j]
      // Skip basic lands, since they just dilute the percentages.
      if (IsBasicLand(card)) {
        continue
      }

      // Note: This calculation excludes colorless cards, meaning percentages for colors
      // will not add up to 100%. This is OK specifically for my cube though, since there
      // isn't really a colorless archtetype available.
      totalCards += 1
      totalCardsInDeck += 1
      for (var k in card.colors) { // TODO: Include hybrid color identities?
        let color = card.colors[k]
        // Skip any card colors that aren't a part of the deck's color
        // identity. This helps prevent hybrid cards accidentally bringing down
        // a given color's play rate.
        if (!decks[i].colors.includes(color)) {
          continue
        }
        tracker[color].cards += 1
        if (!cardsPerColorInDeck[color]) {
          cardsPerColorInDeck[color] = 0
        }
        cardsPerColorInDeck[color] += 1
      }
    }
    for (var color in cardsPerColorInDeck) {
      let num = cardsPerColorInDeck[color]
      tracker[color].deck_percentages.push(num / totalCardsInDeck)
    }
  }

  // Summarize tracker stats and calculate percentages.
  for (var color in tracker) {
    // First, calculate the average color devotion of each deck based on card count.
    // This is a measure of, on average, how many cards of a given color appear in
    // decks with that color identity. A lower percentage means a splash, a higher percentage
    // means it is a primary staple.
    const density_sum = tracker[color].deck_percentages.reduce((sum, a) => sum + a, 0);
    const density_count = tracker[color].deck_percentages.length;
    tracker[color].average_deck_percentage = Math.round(100 * density_sum / density_count);

    // Calculate the percentage of all cards drafted that are this color.
    tracker[color].total_pick_percentage = Math.round(100 * tracker[color].cards / totalCards);
  }
  return tracker
}
