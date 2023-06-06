import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { AverageCMC, ExtractColors, DropdownHeader} from "../DeckViewer.js"
import { FetchDraftIndex, FetchDeckIndex } from "../DeckViewer.js"
import { IsBasicLand } from "../DeckViewer.js"

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks.
  const [decks, setDecks] = useState(null);

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the color / color pair win rate widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [winrates, setWinrates] = useState(null);
  const [colorTypeSelection, setColorTypeSelection] = useState("Mono");
  const ddOpts =  [{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]
  function onSelected(event) {
    setColorTypeSelection(event.target.value)
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

  // Load the decks on startup and whenever the dates change.
  useEffect(() => {
    LoadCube(onLoad, startDate, endDate)
  }, [startDate, endDate])
  function onLoad(d) {
    setDecks({...d})
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
      <div float="left">
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
      </div>

      <ColorWidget
        ddOpts={ddOpts}
        colorTypeSelection={colorTypeSelection}
        onSelected={onSelected}
        decks={decks}
        colorTypeSelection={colorTypeSelection}
        winrates={winrates}
      />

      <PopularArchetypeWidget
        decks={decks}
        dropdownSelection={colorTypeSelection}
      />

      <SuccessfulArchetypeWidget
        decks={decks}
        dropdownSelection={colorTypeSelection}
      />

      <CardWidget
        decks={decks}
        dropdownSelection={cardWidgetSelection}
        cardWidgetOpts={cardWidgetOpts}
        onSelected={onCardWidgetSelected}
        minDrafts={minDrafts}
        minDraftsOpts={minDraftsOpts}
        onMinDraftsSelected={onMinDraftsSelected}
      />

    </div>
  );
}

function SuccessfulArchetypeWidget(input) {
  let data = ArchetypeData(input.decks)
  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td>Win rate</td>
            <td>Archetype</td>
            <td>Record</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map((t) => (
              <PrintRow color={t.type} value={t.record} p={t.win_percent}/>
            )).sort(comparePercentages)
          }
        </tbody>
      </table>
      </div>
  );
}


function PopularArchetypeWidget(input) {
  let data = ArchetypeData(input.decks)
  return (
    <div className="widget">
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td>Build rate</td>
            <td>Archetype</td>
            <td># Decks</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map((t) => (
              <PrintRow color={t.type} value={t.count} p={t.build_percent}/>
            )).sort(comparePercentages)
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

function DateSelector(input) {
  return (
    <label className="dropdown">
      <label for="start">{input.label}</label>
      <input
        type="date"
        id={input.id}
        value={input.value}
        onChange={input.onChange}
      />
    </label>
  )
}


function CardWidget(input) {
  let data = CardData(input.decks, input.minDrafts)
  if (input.dropdownSelection == "Pick rate") {
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
              <td>Pick rate</td>
              <td>Card</td>
              <td># Decks</td>
            </tr>
          </thead>
          <tbody>
          {
            data.map(function(item) {
             return (
               <tr p={item.pick_percent} className="card" key={item.name}>
                 <td>{item.pick_percent}%</td>
                 <td><a href={item.url} target="_blank">{item.name}</a></td>
                 <td>{item.count}</td>
               </tr>
             )
            }).sort(comparePercentages)
          }
          </tbody>
        </table>
        </div>
    );
  } else {
        return (
      <div className="widget">
        <DropdownHeader
          label="Stats type"
          options={input.cardWidgetOpts}
          value={input.colorTypeSelection}
          onChange={input.onSelected}
        />

        <DropdownHeader
          label="Min drafts"
          options={input.minDraftsOpts}
          value={input.minDrafts}
          onChange={input.onMinDraftsSelected}
        />


        <table className="winrate-table">
          <thead className="table-header">
            <tr>
              <td>Win rate</td>
              <td>Card</td>
              <td># Decks</td>
            </tr>
          </thead>
          <tbody>
            {
              data.map(function(item) {
               return (
                 <tr p={item.win_percent} className="card" key={item.name}>
                   <td>{item.win_percent}%</td>
                   <td><a href={item.url} target="_blank">{item.name}</a></td>
                   <td>{item.count}</td>
                 </tr>
               )
              }).sort(comparePercentages)
            }
          </tbody>
        </table>
        </div>
    );
  }
}


function CardData(decks, minDrafts) {
  let tracker = {}
  let totalDecks = 0
  let drafts = new Map()
  for (var i in decks) {
    totalDecks += 1
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
      }
      tracker[card.name].count += 1
      tracker[card.name].wins += decks[i].wins
      tracker[card.name].losses += decks[i].losses
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


// The PopularColorsWidget shows which colors are drafted the most.
function PopularColorsWidget(input) {
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

  // Convert to a list for sorting.
  let data = []
  for (var color in tracker) {
    // If dual is set, only show dual colors.
    // Otherwise, only show single colors.
    // `color` here is a string made of one or more characters - e.g., W or UB.
    if (input.dropdownSelection == "Dual" && color.length != 2) {
      continue
    } else if (input.dropdownSelection == "Mono" && color.length != 1 ) {
      continue
    } else if (input.dropdownSelection == "Trio" && color.length != 3) {
      continue
    }

    tracker[color].percent = Math.round(tracker[color].count / totalDecks * 100)
    data.push(tracker[color])
  }

  return (
    <table className="winrate-table">
      <thead className="table-header">
        <tr>
          <td>Build rate</td>
          <td>Color</td>
          <td># Decks</td>
        </tr>
      </thead>
      <tbody>
        {
          data.map((color) => (
            <PrintRow color={color.color} value={color.count} p={color.percent}/>
          )).sort(comparePercentages)
        }
      </tbody>
    </table>
  );
}

function ColorWidget(input) {
  return (
      <div className="widget">
        <DropdownHeader
          label="Select color type"
          options={input.ddOpts}
          value={input.colorTypeSelection}
          onChange={input.onSelected}
        />

        <PopularColorsWidget
          decks={input.decks}
          dropdownSelection={input.colorTypeSelection}
        />

        <ColorWinratesWidget
          winrates={input.winrates}
          ddOpts={input.ddOpts}
          dropdownSelection={input.colorTypeSelection}
          onSelected={input.onSelected}
        />
      </div>
  );
}

// ColorWinratesWidget displays the win percentages and records by color.
function ColorWinratesWidget(input) {
  if (input == null || input.winrates == null) {
    return null
  }

  // Iterate and calculate the actual win percentage for each.
  // Also, convert from a map to a list at this point so that we can
  // sort by win percentage.
  let wr = []
  for (var color in input.winrates) {
    // If dual is set, only show dual colors.
    // Otherwise, only show single colors.
    // `color` here is a string made of one or more characters - e.g., W or UB.
    if (input.dropdownSelection == "Dual" && color.length != 2) {
      continue
    } else if (input.dropdownSelection == "Mono" && color.length != 1 ) {
      continue
    } else if (input.dropdownSelection == "Trio" && color.length != 3) {
      continue
    }
    let ratesForColor = input.winrates[color]
    let wins = ratesForColor.wins
    let losses = ratesForColor.losses
    let p = Math.round(wins / (wins + losses) * 100)
    if ((wins + losses) == 0) {
      p = 0
    }
    ratesForColor.percent = p
    ratesForColor.value = wins + "-" + losses + "-" + 0
    wr.push(ratesForColor)
  }

  return (
    <table className="winrate-table">
      <thead className="table-header">
        <tr>
          <td>Win rate</td>
          <td>Color</td>
          <td>Record</td>
        </tr>
      </thead>
      <tbody>
        {
          wr.map((rates) => (
            <PrintRow color={rates.color} value={rates.value} p={rates.percent}/>
          )).sort(comparePercentages)
        }
      </tbody>
    </table>
  );
}

// comparePercentages compares winrates in order to
// sort the winrates table from most winning to least winning.
function comparePercentages(a, b) {
  if (a.props.p > b.props.p) {
    return -1
  } else if (a.props.p < b.props.p) {
    return 1
  }
  return 0
}

function PrintRow({ color, value, p }) {
  return (
      <tr key={color} className="winrate-row">
        <td>{p}%</td>
        <td>{color}</td>
        <td>{value}</td>
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

// GetColorIdentity returns all the color identities of this deck.
// e.g., a WUG deck will return [W, U, G, WU, WG, UG, WUG]
function GetColorIdentity(deck) {
    let allColors = new Map()
    for (var j in deck.colors) {
      let c = deck.colors[j]
      allColors.set(c, true)

      // Dual-colors.
      for (var k in deck.colors) {
        let c2 = deck.colors[k]
        let pair = CombineColors([c, c2])
        if (c == c2) {
          continue
        }
        allColors.set(pair, true)

        // Triomes.
        for (var l in deck.colors) {
          let c3 = deck.colors[l]
          let trio = CombineColors([c, c2, c3])
          if (c3 == c || c3 == c2) {
            continue
          }
          allColors.set(trio, true)
        }
      }
    }
    return Array.from(allColors.keys())
}

// CombineColors returns the canonical name for the color pairing,
// so that we don't double count. e.g., UB and BU.
function CombineColors(colors) {
  colors.sort(function(a,b) {
    let order = {
      "W": 0,
      "U": 1,
      "B": 2,
      "R": 3,
      "G": 4,
    }
    let orderA = order[a]
    let orderB = order[b]
    return orderA - orderB
  })
  return colors.join('')
}

function isDateBetween(dateString, startDateString, endDateString) {
  if (startDateString == null || endDateString == null) {
    return true
  }
  const date = new Date(dateString);
  const startDate = new Date(startDateString);
  const endDate = new Date(endDateString);
  return date >= startDate && date <= endDate;
}


async function LoadCube(onLoad, start, end) {
  console.log("Loading cube data")

  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchDraftIndex(null)

  // Combine to find all of the decknames.
  let deckNames = []
  for (var i in idx) {
    // Get the decks for this draft.
    let draft = idx[i]
    if (!isDateBetween(draft.name, start, end)) {
      continue
    }
    let deckIdx = await FetchDeckIndex(draft.name, null)
    for (var j in deckIdx) {
      // For each deck in the draft, add it to the total.
      let deck = deckIdx[j]
      deckNames.push(
        {
          draft: draft.name,
          deck: deck.deck,
          file: "drafts/" + draft.name + "/" + deck.deck,
        }
      )
    }
  }

  let decks = []
  for (var i in deckNames) {
    let info = deckNames[i]
    const resp = await fetch(info.file);
    let d = await resp.json();

    // Populate the deck with calculated fields and then save the deck.
    d.avg_cmc = AverageCMC({deck: d})
    d.colors = ExtractColors({deck: d})
    d.draft = info.draft
    decks.push(d)
  }

  // Callback with all of the loaded decks.
  onLoad(decks)
}
