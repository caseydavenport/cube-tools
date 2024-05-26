import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadDecks, FetchDraftIndex, FetchDeckIndex, FetchDeck } from "../utils/Fetch.js"
import { Wins, Losses, MatchWins, MatchLosses } from "../utils/Deck.js"
import { RemovalMatches, CounterspellMatches } from "../pages/Decks.js"
import { SortFunc } from "../utils/Utils.js"
import { Button, TextInput, DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"

// This function builds the DeckViewer widget for selecting and viewing statistics
// about a particular deck.
export default function DeckViewer() {
  // We keep two sets of variables - one for the dropdown values,
  // and another for the actual deck we want to display.
  // The dropdown values are just for filtering the deck list.
  const [selectedDeck, setSelectedDeck] = useState("");
  const [selectedDraft, setSelectedDraft] = useState("");
  const [draftDropdown, setDraftDropdown] = useState("");

  // The cache of loaded deck.
  const [fetched, setFetched] = useState(new Map());

  // The deck currently being displayed.
  const [deck, setDeck] = useState("");

  // Options for the draft dropdown.
  const [draftDropdownOptions, setDraftDropdownOptions] = useState([]);

  // Dropdown for mainboard vs. sideboard.
  const [mainboardSideboard, setMainboardSideboard] = useState("Mainboard");

  // Store all decks.
  const [decks, setDecks] = useState([]);
  function onDecksLoaded(d) {
    setDecks([...d])

    // Populate the draft dropdown options with all drafts.
    const draftOpts = [{ label: "", value: "" }]
    let seenDrafts = new Map()
    for (let deck of d) {
      if (!seenDrafts.has(deck.draft)) {
        draftOpts.push({ label: deck.draft, value: deck.draft })
        seenDrafts.set(deck.draft, true)
      }
    }
    setDraftDropdownOptions(draftOpts)
  }

  function onDeckClicked(event) {
    // The ID is the full path to the deck, of the form
    // drafts/<draft>/<deck>.

    // Parse the draft and deck, and update the dropdowns.
    let splits = event.target.id.split("/")
    setSelectedDraft(splits[1])
    setSelectedDeck(splits[2])
  }

  // For matching decks.
  const [matchStr, setMatchStr] = useState("");
  function onMatchUpdated(event) {
    setMatchStr(event.target.value)
  }
  const [minCMC, setMinCMC] = useState(0);
  const [maxCMC, setMaxCMC] = useState(0);
  function onMinCMCUpdated(event) {
    setMinCMC(event.target.value)
  }
  function onMaxCMCUpdated(event) {
    setMaxCMC(event.target.value)
  }

  // Start of day load the draft index.
  // This is used to populate the drafts dropdown menu.
  useEffect(() => {
    LoadDecks(onDecksLoaded, null, null, 0, "")
  }, [])

  // Handle changes to the draft and deck selection dropdowns.
  function onDeckSelected(event) {
    setSelectedDeck(event.target.value)
  }
  function onDraftSelected(event) {
    // Set the selected draft, and update the list of decks.
    setDraftDropdown(event.target.value)
    setSelectedDraft(event.target.value)

    // Clear out the selected deck if a new draft is picked.
    setSelectedDeck("")
  }
  function onBoardSelected(event) {
    setMainboardSideboard(event.target.value)
  }
  let boardOptions = [
    { label: "Mainboard", value: "Mainboard" },
    { label: "Sideboard", value: "Sideboard" },
  ]

  // Callback for sucessfully fetching a Deck.
  // This function updates the UI with the deck's contents.
  function onFetch(d) {
    const newdeck = {...d}
    setDeck(newdeck);

    // Update cache.
    fetched.set(selectedDeck, newdeck)
    setFetched(new Map(fetched))
  }

  // Whenever the selected deck is updated.
  useEffect(() => {
    if (!selectedDeck || !selectedDraft) {
      // On page load, selected deck will be empty.
      setDeck({})
      return
    }

    // Find the deck based on the selected draft and player,
    // and set the active deck.
    for (let deck of decks) {
      if (deck.draft == selectedDraft && deck.file.endsWith(selectedDeck)) {
        setDeck(deck)
        return
      }
    }
  }, [selectedDeck, selectedDraft])

  return (
    <div>
      <div>
        <DropdownHeader
          className="dropdown"
          label="Select a draft"
          options={draftDropdownOptions}
          value={selectedDraft}
          onChange={onDraftSelected}
        />

        <DropdownHeader
          className="dropdown"
          label="Board"
          options={boardOptions}
          value={mainboardSideboard}
          onChange={onBoardSelected}
        />

        <TextInput
          className="dropdown"
          label="Fuzzy"
          value={matchStr}
          onChange={onMatchUpdated}
        />

        <NumericInput
          className="dropdown"
          label="Min. cmc"
          value={minCMC}
          onChange={onMinCMCUpdated}
        />

        <NumericInput
          className="dropdown"
          label="Max. cmc"
          value={maxCMC}
          onChange={onMaxCMCUpdated}
        />

      </div>

      <div className="house-for-widgets">
        <FilteredDecks
          decks={decks}
          onDeckClicked={onDeckClicked}
          selectedDraft={draftDropdown}
          matchStr={matchStr}
          minCMC={minCMC}
          maxCMC={maxCMC}
        />

        <DisplayDeck
          deck={deck}
          mbsb={mainboardSideboard}
          matchStr={matchStr}
        />
      </div>
    </div>
  );
}

// DropdownSelector is a dropdown selector that sits right below the main navbar.
export function DropdownSelector({ label, value, options, onChange }) {
  return (
   <label className="dropdown">
    {label}
     <select className="select" value={value} onChange={onChange}>
       {
         options.map((option) => (
           <option key={option.label} className="select-option" file={option.value}>{option.value}</option>
         ))
       }
     </select>
   </label>
  )
}

function FilteredDecks(input) {
  let decks = []

  // Each draft gets assigned a color from a pre-determined bucket.
  let draftToColor = new Map()
  let colors = [
    "#474b4f",
    "#777b7f",

    // Uncomment if you want a colorful time.
    // "#AE6989",
    // "#0E6989",
    // "#EE6989",
    // "#FEA989",
    // "#6EA579",
    // "#AE69F9",
  ]
  let idx = 0

  for (let d of input.decks) {
    // Perform filtering of decks we want to display.
    if (input.selectedDraft != "" && input.selectedDraft != d.date) {
      continue
    }
    if (input.minCMC > 0 && d.avg_cmc < input.minCMC) {
      continue
    }
    if (input.maxCMC > 0 && d.avg_cmc > input.maxCMC) {
      continue
    }

    if (!draftToColor.has(d.draft)) {
      draftToColor.set(d.draft, colors[idx % colors.length])
      idx += 1
    }

    // Do fuzzy matching on the string, including player, cards, etc.
    if (input.matchStr != "") {
      for (let card of d.mainboard) {
        if (card.name.toLowerCase().match(input.matchStr.toLowerCase())) {
          // Card matches string - include the deck.
          decks.push(d)
          break
        }
        if (d.player.toLowerCase().match(input.matchStr.toLowerCase())) {
          // Player matches - include.
          decks.push(d)
          break
        }


        let labelMatch = false
        for (let label of d.labels) {
          if (label.toLowerCase().match(input.matchStr.toLowerCase())) {
            decks.push(d)
            labelMatch = true
            break
          }
        }
        if (labelMatch) {
          break
        }
      }
    } else {
      // No match string - just add the deck.
      decks.push(d)
    }
  }

  return (
    <div className="filtered-decks">
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="decklist" className="header-cell">{decks.length} Decks</td>
          </tr>
        </thead>
        <tbody>
          {
            decks.map(function(deck, idx) {
              let sort=deck.date
              return (
                <tr sort={sort} className="card" key={idx}>
                  <DeckTableCell
                    color={draftToColor.get(deck.draft)}
                    deck={deck}
                    onDeckClicked={input.onDeckClicked}
                  />
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

function DeckTableCell(input) {
  let deck = input.deck
  let record = Wins(input.deck) + "-" + Losses(input.deck)
  let win_percent = Math.round(100 * Wins(input.deck) / (Wins(input.deck) + Losses(input.deck)))
  return (
      <table className="deck-meta-table">
      <tbody>
        <tr className="deck-entry" style={{"--background-color": input.color}}>
          <td style={{"width": "20%", "padding-left": "10px"}} id={deck.file} onClick={input.onDeckClicked} key="date">{deck.date}</td>
          <td style={{"width": "30%", "padding-left": "0px"}} id={deck.file} onClick={input.onDeckClicked} key="player">{deck.player}</td>
          <td style={{"width": "30%", "padding-left": "0px"}} id={deck.file} onClick={input.onDeckClicked} key="wins">{win_percent}% ({record})</td>
        </tr>
      </tbody>
      </table>
  );
}


// DisplayDeck prints out the given deck.
function DisplayDeck(input) {
  let deck = input.deck
  let mbsb = input.mbsb

  // The deck mainboard may not always be set, so we need
  // to initialize to an empty slice.
  let missing = (mbsb == "Mainboard" && !deck.mainboard)
  missing = missing || (mbsb == "Sideboard" && !deck.sideboard)
  if (!deck || missing) {
    return null;
  }

  let cards = deck.mainboard
  if (mbsb == "Sideboard") {
    cards = deck.sideboard
  }

  // Get fields to display.
  let labels = deck.labels.join(', ')
  let acmc = deck.avg_cmc
  let colors = deck.colors
  let cardCount = cards.length

  // Count the number of different types of spells.
  let creatures = 0
  let interaction = 0
  for (let card of cards) {
    // Creature
    if (card.types.includes("Creature")) {
      creatures += 1
    }

    // Interaction - removal and counterspells.
    for (let match of RemovalMatches.concat(CounterspellMatches)) {
      if (card.oracle_text.toLowerCase().match(match)){
        interaction += 1
        break
      }
    }

    // If the card matches the string, we will highlight it.
    card.highlight = false
    if (input.matchStr && card.name.toLowerCase().match(input.matchStr.toLowerCase())) {
      card.highlight = true
    }
  }

  return (
    <div className="deck-view">
      <table className="player-frame">
        <tbody>
        <tr>
          <td className="player-frame-title">Player:</td>
          <td className="player-frame-value">{deck.player}</td>
        </tr>
        <tr>
          <td className="player-frame-title">Deck type(s):</td>
          <td className="player-frame-value">{labels}</td>
        </tr>
        <tr>
          <td className="player-frame-title">Match record:</td>
          <td className="player-frame-value">{MatchWins(deck)}-{MatchLosses(deck)}</td>
        </tr>
        <tr>
          <td className="player-frame-title">Game record:</td>
          <td className="player-frame-value">{Wins(deck)}-{Losses(deck)}</td>
        </tr>
        <tr>
          <td className="player-frame-title">Average CMC:</td>
          <td className="player-frame-value">{acmc}</td>
        </tr>
        <tr>
          <td className="player-frame-title">Colors:</td>
          <td className="player-frame-value">{colors}</td>
        </tr>
        <tr>
          <td className="player-frame-title"># Cards:</td>
          <td className="player-frame-value">{cardCount}</td>
        </tr>
        <tr>
          <td className="player-frame-title"># Creatures:</td>
          <td className="player-frame-value">{creatures}</td>
        </tr>
        <tr>
          <td className="player-frame-title"># Interaction:</td>
          <td className="player-frame-value">{interaction}</td>
        </tr>
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td rowSpan="3">
              <CardList player={deck.player} cards={cards} opts={{cmc: 0}} />
            </td>
          </tr>

          <tr>
            <CardList player={deck.player} cards={cards} opts={{cmc: 1}} />
            <CardList player={deck.player} cards={cards} opts={{cmc: 2}} />
            <CardList player={deck.player} cards={cards} opts={{cmc: 3}} />
          </tr>

          <tr>
            <CardList player={deck.player} cards={cards} opts={{cmc: 4}} />
            <CardList player={deck.player} cards={cards} opts={{cmc: 5}} />
            <CardList player={deck.player} cards={cards} opts={{cmc: 6, gt: true}} />
          </tr>

        </tbody>
      </table>
    </div>
  );
}

function CardList({player, cards, opts}) {
  // Figure out how many of this CMC there are.
  let num = 0
  for (var i in cards) {
    // Count the card if it matches the CMC, or if options specify to include
    // all cards greater than the given value.
    if (opts.gt && cards[i].cmc >= opts.cmc || cards[i].cmc === opts.cmc) {
      num += 1
    }
  }
  if (num === 0) {
    return null
  }

  let title = "CMC: " + opts.cmc + " (" + num + ")"
  if (opts.gt) {
    title = "CMC: " + opts.cmc + "+ (" + num + ")"
  }

  let key = player + opts.cmc

  // Generate the key for this table.
  return (
    <table key={key} className="decklist">
      <thead className="table-header">
        <tr>
          <td className="header-cell">Type</td>
          <td className="header-cell">{title}</td>
        </tr>
      </thead>
      <tbody>
      {
        cards.map(function(card) {
          if (opts.gt && card.cmc >= opts.cmc || card.cmc === opts.cmc) {
            // Card matches the criteria to display.
            let key = card.name + cards.indexOf(card)
            let type = getType(card)
            let text = card.name
            let className = "card"
            if (card.highlight) {
              className = "card-highlight"
            }
            return (
              <tr className={className} key={key} card={card}>
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{type}</a></td>
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{text}</a></td>
              </tr>
            )
          }
        }).sort(cardSort)
      }
      </tbody>
    </table>
  );
}

// cardSort sorts cards by type, followed by card name.
function cardSort(a, b) {
  // Top level is sorted by card type.
  let typeA = getType(a.props.card)
  let typeB = getType(b.props.card)
  if (typeA == typeB) {
    // They are the same type. Compare based on name.
    if (a.props.card.name < b.props.card.name) {
      return -1
    } else {
     return 1
   }
  }

  // Cards are not the same type. Sort based on card type.
  if (typeA < typeB) {
    return -1
  } else if (typeA > typeB) {
    return 1
  }
  return 0
}

function getType(card) {
  if (card.types.includes("Creature")) {
    return "Creature"
  }
  if (card.types.includes("Planeswalker")) {
    return "Planeswalker"
  }
  return card.types[0]
}
