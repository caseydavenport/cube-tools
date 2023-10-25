import React from 'react'
import { useState } from "react";
import { useEffect } from "react";
import { FetchDraftIndex, FetchDeckIndex, FetchDeck } from "../utils/Fetch.js"
import { Wins, Losses } from "../utils/Deck.js"

// This function builds the DeckViewer widget for selecting and viewing statistics
// about a particular deck.
export default function DeckViewer() {
  const [selectedDeck, setSelectedDeck] = useState("");
  const [selectedDraft, setSelectedDraft] = useState("");
  const [fetched, setFetched] = useState(new Map());
  const [deck, setDeck] = useState("");
  const [draftDropdownOptions, setDraftDropdownOptions] = useState([]);
  const [decklist, setDecklist] = useState([]);
  const [mainboardSideboard, setMainboardSideboard] = useState("Mainboard");

  // Called when we successfully fetch the deck list from the selected draft.
  function onDeckIndexFetched(idx) {
    console.log("Fetched deck index")
    const d = [
      { label: "", value: "" },
    ]
    for (var i in idx) {
      let ref = idx[i]
      d.push(
        { label: ref.deck, value: ref.deck }
      )
    }
    setDecklist(d)
  }


  // This function is called when the draft index is loaded.
  // It converts the draft index into an array of dropdown menu options
  // and updates the page's state.
  function onDraftIndexFetched(idx) {
    const d = [
      { label: "", value: "" },
    ]
    for (var i in idx) {
      let ref = idx[i]
      d.push(
        { label: ref.name, value: ref.name }
      )
    }
    setDraftDropdownOptions(d)
  }

  // Start of day load the draft index.
  // This is used to populate the drafts dropdown menu.
  useEffect(() => {
    FetchDraftIndex(onDraftIndexFetched)
  }, [])

  // Handle changes to the draft and deck selection dropdowns.
  function onDeckSelected(event) {
    // Log the update, and store the currently selected deck.
    console.log("Deck selected: " + event.target.value)
    setSelectedDeck(event.target.value)
  }
  function onDraftSelected(event) {
    // Set the selected draft, and update the list of decks.
    console.log("Draft selected: " + event.target.value)
    setSelectedDraft(event.target.value)
    FetchDeckIndex(event.target.value, onDeckIndexFetched)

    // Clear any selected deck, as it is no longer valid.
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
    console.log("onFetch called");
    const newdeck = {...d}
    setDeck(newdeck);

    // Update cache.
    fetched.set(selectedDeck, newdeck)
    setFetched(new Map(fetched))
    console.log("fetch complete")
  }

  // Whenever the selected deck is updated.
  useEffect(() => {
    if (!selectedDeck || !selectedDraft) {
      // On page load, selected deck will be empty.
      console.log("No selected deck")
      setDeck({})
      return
    }
    let path = "drafts/" + selectedDraft + "/" + selectedDeck

    // Check if we need to fetch the deck, and if needed do so.
    const cached = fetched.get(path)
    if (cached) {
      // We've already fetched and cached this deck.
      console.log("deck is cached")
      onFetch(cached)
    } else {
      // Fetch the deck, since this is the first time
      // we've triggered this.
      console.log("need to fetch deck")
      FetchDeck(path, onFetch)
    }
  }, [selectedDeck, selectedDraft])

  return (
    <div>
      <div>
        <DropdownSelector
          label="Select a draft"
          options={draftDropdownOptions}
          value={selectedDraft}
          onChange={onDraftSelected}
        />

        <DropdownSelector
          label="Select a deck"
          options={decklist}
          value={selectedDeck}
          onChange={onDeckSelected}
        />

        <DropdownSelector
          label="Board"
          options={boardOptions}
          value={mainboardSideboard}
          onChange={onBoardSelected}
        />

      </div>

      <div className="house-for-widgets">
        <DisplayDeck
          deck={deck}
          mbsb={mainboardSideboard}
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

// DisplayDeck prints out the given deck.
function DisplayDeck({deck, mbsb}) {
  // The deck mainboard may not always be set, so we need
  // to initialize to an empty slice.
  let missing = (mbsb == "Mainboard" && !deck.mainboard)
  missing = missing || (mbsb == "Sideboard" && !deck.sideboard)
  if (!deck || missing) {
    console.log("no deck");
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
  let wins = Wins(deck)
  let losses = Losses(deck)

  return (
    <div>
    <table className="player-frame">
      <tbody>
      <tr className="player-frame-row">
        <td className="player-frame-title">Player:</td>
        <td className="player-frame-value">{deck.player}</td>
      </tr>
      <tr className="player-frame-row">
        <td className="player-frame-title">Deck type(s):</td>
        <td className="player-frame-value">{labels}</td>
      </tr>
      <tr className="player-frame-row">
        <td className="player-frame-title">Record:</td>
        <td className="player-frame-value">{wins}-{losses}</td>
      </tr>
      <tr className="player-frame-row">
        <td className="player-frame-title">Average CMC:</td>
        <td className="player-frame-value">{acmc}</td>
      </tr>
      <tr className="player-frame-row">
        <td className="player-frame-title">Colors:</td>
        <td className="player-frame-value">{colors}</td>
      </tr>
      <tr className="player-frame-row">
        <td className="player-frame-title"># Cards:</td>
        <td className="player-frame-value">{cardCount}</td>
      </tr>
      </tbody>
    </table>

    <table>
      <tbody>
        <tr>
          <td rowspan="3">
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
            return (
              <tr className="card" key={key} card={card}>
                <td><a href={card.url} target="_blank" rel="noopener noreferrer">{type}</a></td>
                <td><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
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
