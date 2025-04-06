import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { LoadDecks, FetchFile } from "../utils/Fetch.js"
import { Wins, Losses, MatchWins, MatchLosses, MatchDraws, InDeckColor } from "../utils/Deck.js"
import { RemovalMatches, CounterspellMatches } from "../pages/Decks.js"
import { SortFunc } from "../utils/Utils.js"
import { ColorImages, CombineColors } from "../utils/Colors.js"
import { Button, TextInput, DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import ReactMarkdown from "react-markdown";


// This function builds the DeckViewer widget for selecting and viewing statistics
// about a particular deck.
export default function DeckViewer() {
  // We keep two sets of variables - one for the dropdown values,
  // and another for the actual deck we want to display.
  // The dropdown values are just for filtering the deck list.
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [highlightedDeck, setHighlightedDeck] = useState("");
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

  // What to sort the deck list by.
  const sortOptions = [
    "Date", "Wins"
  ]
  const [deckSort, setDeckSort] = useState("date");
  function onDeckSort(event) {
    setDeckSort(event.target.id)
  }

  // Store all decks.
  const [decks, setDecks] = useState([]);
  function onDecksLoaded(d) {
    setDecks([...d])

    // Populate the draft dropdown options with all drafts.
    const draftOpts = [{ label: "", value: "" }]
    let seenDrafts = new Map()
    for (let deck of d) {
      if (!seenDrafts.has(deck.metadata.draft_id)) {
        draftOpts.push({ label: deck.metadata.draft_id, value: deck.metadata.draft_id})
        seenDrafts.set(deck.metadata.draft_id, true)
      }
    }
    setDraftDropdownOptions(draftOpts)
  }

  function onDeckClicked(event) {
    // The ID is assigned to each deck on load.
    // <draft>/<player>/<id>

    // Parse the draft and deck, and update the dropdowns.
    let splits = event.target.id.split("/")
    setSelectedDraft(splits[0])
    setSelectedPlayer(splits[1])

    // Highlight the deck in the side bar.
    setHighlightedDeck(event.target.id)
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

  // Selected description.
  const [description, setDescription] = useState("");
  function onDescriptionFetched(f) {
    setDescription(f)
  }

  // Start of day load the draft index.
  // This is used to populate the drafts dropdown menu.
  useEffect(() => {
    LoadDecks(onDecksLoaded, null, null, 0, "")
  }, [])

  // Handle changes to the draft and deck selection dropdowns.
  function onDeckSelected(event) {
    setSelectedPlayer(event.target.value)
  }
  function onDraftSelected(event) {
    // Set the selected draft, and update the list of decks.
    setDraftDropdown(event.target.value)
    setSelectedDraft(event.target.value)

    // Clear out the selected deck if a new draft is picked.
    setSelectedPlayer("")
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
    fetched.set(selectedPlayer, newdeck)
    setFetched(new Map(fetched))
  }

  // Whenever the selected deck is updated.
  useEffect(() => {
    if (!selectedPlayer || !selectedDraft) {
      // On page load, selected deck will be empty.
      setDeck({})
      return
    }

    // Find the deck and set the active deck.
    for (let deck of decks) {
      if (deck.metadata.path == highlightedDeck) {
        setDeck(deck)

        // Load the deck description, if it exists.
        let f = "data/polyverse/" + deck.metadata.draft_id + "/" + deck.player + ".report.md"
        FetchFile(f.toLowerCase(), onDescriptionFetched)
        return
      }
    }
  }, [highlightedDeck])

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
          highlight={highlightedDeck}
          onDeckClicked={onDeckClicked}
          selectedDraft={draftDropdown}
          selectedPlayer={selectedPlayer}
          onSortHeader={onDeckSort}
          deckSort={deckSort}
          matchStr={matchStr}
          minCMC={minCMC}
          maxCMC={maxCMC}
        />

        <DisplayDeck
          deck={deck}
          mbsb={mainboardSideboard}
          matchStr={matchStr}
          description={description}
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

    if (!draftToColor.has(d.metadata.draft_id)) {
      draftToColor.set(d.metadata.draft_id, colors[idx % colors.length])
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
            <td colSpan="3" onClick={input.onHeaderClick} id="decklist-title" className="header-cell">{decks.length} Decks</td>
          </tr>
          <tr>
            <td style={{"width": "20%", "paddingLeft": "10px"}} onClick={input.onSortHeader} id="date" className="header-cell">Date</td>
            <td style={{"width": "30%", "paddingLeft": "0px"}} onClick={input.onSortHeader} id="player" className="header-cell">Player</td>
            <td style={{"width": "30%", "paddingLeft": "0px"}} onClick={input.onSortHeader} id="wins" className="header-cell">Record</td>
          </tr>
        </thead>
        <tbody>
          {
            decks.map(function(deck, idx) {
              // Sort by both date and draft ID by default. We include the draft ID to ensure
              // sorting is stable for decks with the same date in different drafts.
              let sort=deck.date + deck.metadata.draft_id
              switch (input.deckSort) {
                case "wins":
                  sort = DeckSortWins(deck)
                  break;
                case "player":
                  sort = deck.player;
                  break;
              }

              let color = draftToColor.get(deck.metadata.draft_id)
              let className = "widget-table-row"

              if (input.highlight == deck.metadata.path) {
                className = "card-highlight"
                color = "#6EA579"
              }

              return (
                <tr sort={sort} className={className} key={idx}>
                  <td className="widget-table-row" colSpan="3">
                    <DeckTableCell
                      color={color}
                      deck={deck}
                      idx={idx}
                      onDeckClicked={input.onDeckClicked}
                    />
                  </td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

function DeckSortWins(deck) {
  // Primary sort by number of match wins, secondary by game win percentage.
  let gameWin = GameWinPercent(deck)
  let sort = MatchWins(deck) + gameWin

  // If there are any matches at all, rank this deck first.
  if (MatchWins(deck) || MatchLosses(deck)) {
    sort += 100
  }

  // If the deck has no matches and no games, just put it at the bottom.
  if (!MatchWins(deck) && !MatchLosses(deck) && !Wins(deck) && !Losses(deck)) {
    sort = -1
  }
  return sort
}

function GameWinPercent(deck) {
  if (Wins(deck) == 0 && Losses(deck) == 0) {
    return 0
  }
  return Wins(deck) / (Wins(deck) + Losses(deck))
}


function DeckTableCell(input) {
  let deck = input.deck
  let record = MatchWins(input.deck) + "-" + MatchLosses(input.deck) + "-" + MatchDraws(input.deck)
  if (MatchWins(deck) == 0 && MatchLosses(deck) == 0 && MatchDraws(deck) == 0) {
    record = "N/A"
  }

  let win_percent = Math.round(100 * Wins(input.deck) / (Wins(input.deck) + Losses(input.deck)))
  return (
      <table className="deck-meta-table">
      <tbody>
        <tr className="deck-entry" style={{"--background-color": input.color}}>
          <td style={{"width": "20%", "paddingLeft": "10px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="date">{deck.date}</td>
          <td style={{"width": "30%", "paddingLeft": "0px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="player">{deck.player}</td>
          <td style={{"width": "30%", "paddingLeft": "0px"}} id={deck.metadata.path} idx={input.idx} onClick={input.onDeckClicked} key="wins">{record} ({win_percent}%)</td>
        </tr>
      </tbody>
      </table>
  );
}


// DisplayDeck prints out the given deck.
function DisplayDeck(input) {
  let deck = input.deck

  // The deck mainboard may not always be set, so we need
  // to initialize to an empty slice.
  let missing = (input.mbsb == "Mainboard" && !deck.mainboard)
  missing = missing || (input.mbsb == "Sideboard" && !deck.sideboard)
  if (!deck || missing) {
    return null;
  }

  let cards = deck.mainboard
  if (input.mbsb == "Sideboard") {
    cards = deck.sideboard
  }

  let cardMap = new Map();
  for (let card of deck.mainboard) {
    cardMap.set(card.name, card)
  }
  for (let card of deck.sideboard) {
    cardMap.set(card.name, card)
  }

  return (
    <div className="deck-view">
      <PlayerFrame {...input} />
      <div className="flexhouse">
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 0}} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 1}} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 2}} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 3}} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 4}} />
        <CardList player={deck.player} cards={cards} deck={deck} sb={input.mbsb == "Sideboard"} opts={{cmc: 5, gt: true}} />
        <DeckReport player={deck.player} cardMap={cardMap} description={input.description} deck={deck} />
      </div>
    </div>
  );
}

function DeckReport(input) {
  if (input.description == "") {
    return;
  }

  // Replace [[cardname]] with links to the card.
  let description = input.description
  const match = /\[\[.*\]\]/g
  let replace = function(val) {
    // Determine the card name.
    let cardName = val.replace("[[", "").replace("]]", "")

    if (input.cardMap.has(cardName)) {
      return "**[" + cardName + "](" + input.cardMap.get(cardName).url + ")**"
    }

    // No match - return without the link.
    return cardName
  }
  description = description.replace(match, replace)

  return (
    <div className="decklist-description">
      <div className="table-header">
        Notes from the draft
      </div>

      <ReactMarkdown>
        {description}
      </ReactMarkdown>
    </div>
  );
}

function PlayerFrame(input) {
  let deck = input.deck
  let cards = deck.mainboard
  if (input.mbsb == "Sideboard") {
    cards = deck.sideboard
  }

  // Get fields to display.
  let labels = deck.labels.join(', ')
  let acmc = deck.avg_cmc
  let colors = ColorImages(deck.colors)
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
  );
}

function CardList({player, cards, deck, sb, opts}) {
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

  let title = "CMC=" + opts.cmc + " (" + num + " cards)"
  if (opts.gt) {
    title = "CMC=" + opts.cmc + "+ (" + num + " cards)"
  }

  let key = player + opts.cmc

  let toDisplay = new Array()
  for (let card of cards) {
    if (opts.gt && card.cmc >= opts.cmc || card.cmc === opts.cmc) {
      // Card matches the criteria to display.
      toDisplay.push(card)
    }
  }

  // Generate the key for this table.
  return (
    <div className="decklist-wrapper">
      <table key={key} className="decklist">
        <thead className="table-header">
          <tr>
            <td colSpan="2" className="header-cell">{title}</td>
          </tr>
        </thead>
        <tbody>
        {
          toDisplay.map(function(card) {
            let key = card.name + cards.indexOf(card)
            let type = getType(card)
            let text = card.name
            let className = "widget-table-row"
            if (card.highlight) {
              className = "card-highlight"
            } else if (sb && InDeckColor(card, deck)) {
              className = "card-playable-highlight"
            }
            return (
              <tr className={className} key={key} card={card}>
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{type}</a></td>
                <td className="padded"><a href={card.url} target="_blank" rel="noopener noreferrer">{text}</a></td>
              </tr>
            )
          }).sort(cardSort)
        }
        </tbody>
      </table>
    </div>
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
