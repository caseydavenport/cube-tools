import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { AverageCMC, ExtractColors, DropdownHeader } from "../DeckViewer.js"
import { FetchDraftIndex, FetchDeckIndex } from "../DeckViewer.js"

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // Store all of the decks.
  const [decks, setDecks] = useState(null);

  ///////////////////////////////////////////////////////////////////////////////
  // State used for the color / color pair win rate widget.
  ///////////////////////////////////////////////////////////////////////////////
  const [winrates, setWinrates] = useState(null);
  const [dropdownSelection, setDropdownSelection] = useState("Mono");
  const ddOpts =  [{ label: "Mono", value: "Mono" }, { label: "Dual", value: "Dual" }, { label: "Trio", value: "Trio" }]
  function onSelected(event) {
    setDropdownSelection(event.target.value)
  }

  // Load the decks on startup, just once.
  useEffect(() => {
    LoadCube(onLoad)
  }, [])
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
      <PrintWinrates
        winrates={winrates}
        ddOpts={ddOpts}
        dropdownSelection={dropdownSelection}
        onSelected={onSelected}
      />
    </div>
  );
}

function PopularColorsWidget(input) {

}

// PrintWinrates displays the win percentages and records by color.
function PrintWinrates(input) {
  if (input == null || input.winrates == null) {
    return null
  }

  // Iterate and calculate the actual win percentage for each.
  // Also, convert from a map to a slice at this point so that we can
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
    let p = parseFloat(wins / (wins + losses) * 100).toFixed(0)
    if ((wins + losses) == 0) {
      p = 0
    }
    ratesForColor.percent = p
    wr.push(ratesForColor)
  }

  return (
    <div className="widget">
    <DropdownHeader
        label="Select color type"
        options={input.ddOpts}
        value={input.dropdownSelection}
        onChange={input.onSelected}
      />

    <table className="winrate-table">
      <thead className="table-header">
        <td>Percentage</td>
        <td>Color</td>
        <td>Record</td>
      </thead>
      <tbody>
        {
          wr.map((rates) => (
            <PrintWinratesForColor color={rates.color} wins={rates.wins} losses={rates.losses} p={rates.percent}/>
          )).sort(compareWinrates)
        }
      </tbody>
    </table>
    </div>
  );
}

// compareWinrates compares winrates in order to
// sort the winrates table from most winning to least winning.
function compareWinrates(a, b) {
  if (a.props.p > b.props.p) {
    return -1
  } else if (a.props.p < b.props.p) {
    return 1
  }
  return 0
}

function PrintWinratesForColor({ color, wins, losses, p }) {
  if (wins == 0 && losses == 0) {
    // Skip combinations that have no matches.
    return null
  }
  return (
      <tr key={color} className="winrate-row">
        <td>{p}%</td>
        <td>{color}</td>
        <td>{wins} - {losses} - 0</td>
    </tr>
  );
}


function GetWinrates(decks) {
  // Go through each deck, and add its winrates to the color count.
  // Initialize winrates to zero first.
  let tracker = {}
  for (var i in decks) {
    let d = decks[i]
    let done = new Map()
    for (var j in d.colors) {
      let c = d.colors[j]
      if (tracker[c] == null) {
        tracker[c] = {wins: 0, losses: 0, color: c}
      }
      tracker[c].wins += d.wins
      tracker[c].losses += d.losses

      // Add in dual-color winrates as well.
      // Note that this includes tri-color decks, which will count towards
      // both of their component dual-combinations.
      for (var k in d.colors) {
        let c2 = d.colors[k]
        let pair = CombineColors([c, c2])
        if (c == c2 || done.get(pair)) {
          // Skip color pairing with itself, or if we've already
          // handled this color pair.
          continue
        }
        if (tracker[pair] == null) {
          tracker[pair] = {wins: 0, losses: 0, color: pair}
        }
        tracker[pair].wins += d.wins
        tracker[pair].losses += d.losses
        done.set(pair, true)

        // And we might as well add in tri-color combos...
        for (var l in d.colors) {
          let c3 = d.colors[l]
          let trio = CombineColors([c, c2, c3])
          if (c3 == c || c3 == c2) {
            continue
          }
          if (tracker[trio] == null) {
            tracker[trio] = {wins: 0, losses: 0, color: trio}
          }
          tracker[trio].wins += d.wins
          tracker[trio].losses += d.losses
          done.set(trio, true)
        }
      }
    }
  }
  return tracker
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

async function LoadCube(onLoad) {
  console.log("Loading cube data")

  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchDraftIndex(null)

  // Combine
  let deckNames = []
  for (var i in idx) {
    // Get the decks for this draft.
    let draft = idx[i]
    let deckIdx = await FetchDeckIndex(draft.name, null)
    for (var j in deckIdx) {
      // For each deck in the draft, add it to the total.
      let deck = deckIdx[j]
      deckNames.push(
        "drafts/" + draft.name + "/" + deck.deck,
      )
    }
  }

  let decks = []
  for (var i in deckNames) {
    let file = deckNames[i]
    const resp = await fetch(file);
    let d = await resp.json();

    // Populate the deck with calculated fields and then save the deck.
    d.avg_cmc = AverageCMC({deck: d})
    d.colors = ExtractColors({deck: d})
    decks.push(d)
  }

  // Callback with all of the loaded decks.
  onLoad(decks)
}

