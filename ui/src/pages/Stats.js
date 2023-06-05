import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { AverageCMC, ExtractColors, DropdownSelector } from "../DeckViewer.js"
import { FetchDraftIndex, FetchDeckIndex } from "../DeckViewer.js"

// StatsViewer displays stats spanning the selected drafts.
export default function StatsViewer() {
  // First, load all of the cards that we want to analyze.
  const [decks, setDecks] = useState(null);
  const [winrates, setWinrates] = useState(null);
  const [dropdownSelection, setDropdownSelection] = useState(null);

  useEffect(() => {
    LoadCube(onLoad)
  }, [])

  function onLoad(d) {
    setDecks({...d})
  }

  useEffect(() => {
    if (decks != null) {
      let w = GetWinrates(decks)
      setWinrates(w)
    }
  }, [decks])

  let ddOpts =  [
    { label: "Mono", value: "Mono" },
    { label: "Dual", value: "Dual" },
  ]

  function onSeleted(event) {
    setDropdownSelection(event.target.value)
  }

  let dual = dropdownSelection == "Dual"

  return (
    <div>
      <DropdownSelector
        label=""
        options={ddOpts}
        value={dropdownSelection}
        onChange={onSeleted}
      />
      <PrintWinrates winrates={winrates} dual={dual} />
    </div>
  );
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

function PrintWinrates(inp) {
  if (inp == null || inp.winrates == null) {
    return null
  }

  // Iterate and calculate the actual win percentage for each.
  // Also, convert from a map to a slice at this point so that we can
  // sort by win percentage.
  let wr = []
  for (var color in inp.winrates) {
    // If dual is set, only show dual colors.
    // Otherwise, only show single colors.
    if (inp.dual && color.length != 2) {
      continue
    } else if (!inp.dual && color.length != 1 ) {
      continue
    }
    let ratesForColor = inp.winrates[color]
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
  let colors = ["U", "R", "B", "G", "W"]
  for (var i in colors) {
    let c = colors[i]
    tracker[c] = {wins: 0, losses: 0, color: c}
    for (var j in colors) {
      let c2 = colors[j]
      let pair = c + c2
      if (c == c2) {
        // Skip color pairing with itself.
        continue
      }
      // Add the color pair.
      tracker[pair] = {wins: 0, losses: 0, color: pair}
    }
  }

  for (var i in decks) {
    let d = decks[i]
    let done = new Map()
    for (var j in d.colors) {
      let c = d.colors[j]
      tracker[c].wins += d.wins
      tracker[c].losses += d.losses

      // Add in dual-color winrates as well.
      for (var k in d.colors) {
        let c2 = d.colors[k]
        let pair = ColorPair(c, c2)
        if (c == c2 || done.get(pair)) {
          // Skip color pairing with itself, or if we've already
          // handled this color pair.
          continue
        }
        tracker[pair].wins += d.wins
        tracker[pair].losses += d.losses
        done.set(pair, true)
      }
    }
  }
  return tracker
}

// ColorPair returns the canonical name for the color pairing,
// so that we don't double count. e.g., UB and BU.
function ColorPair(a, b) {
  let colors = [a, b]
  colors.sort()
  return colors[0] + colors[1]
}
