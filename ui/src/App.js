import { useState } from "react";
import { useEffect } from "react";

export default function Main() {
  const [selectedDeck, setSelectedDeck] = useState("");
  const [selectedDraft, setSelectedDraft] = useState("");
  const [fetched, setFetched] = useState(new Map());
  const [deck, setDeck] = useState("");

  // TODO: Load this dynamically.
  const decklist = [
    { label: "", value: "" },
    { label: "casey", value: "casey.json" },
    { label: "jen", value: "jen.json" },
    { label: "grant", value: "grant.json" },
    { label: "matt", value: "matt.json" },
  ]

  // For now, drafts need to be manually added here in order to show up in the UI.
  // Eventually, this should be determined dynamically.
  const drafts = [
    { label: "1", value: "2023-05-31" },
    { label: "2", value: "2023-05-31" },
  ]

  useEffect(() => {
    console.log("Deck updated")
    console.log(deck)
  }, [deck])

  // Handle changes to the draft and deck selection dropdowns.
  function onDeckSelected(event) {
    // Log the update, and store the currently selected deck.
    console.log("Deck selected: " + event.target.value)
    setSelectedDeck(event.target.value)
  }
  function onDraftSelected(event) {
    console.log("Draft selected: " + event.target.value)
    console.log(event.target.value);
    setSelectedDraft(event.target.value)
  }

  // Callback for sucessfully fetching a Deck.
  // This function updates the UI with the deck's contents.
  function onFetch(d) {
    const newdeck = {...d}
    console.log("onFetch called");
    setDeck(newdeck);

    fetched.set(selectedDeck, newdeck)
    setFetched(new Map(fetched))
    console.log(newdeck)
    console.log("fetch complete")
  }

  // Whenever the selected deck is updated.
  useEffect(() => {
    if (!selectedDeck) {
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
  }, [selectedDeck])

  return (
    <>
      <div>
        <DropdownSelector
          label="Select a draft"
          options={drafts}
          value={selectedDraft}
          onChange={onDraftSelected}
        />

        <DropdownSelector
          label="Select a deck"
          options={decklist}
          value={selectedDeck}
          onChange={onDeckSelected}
        />
      </div>

      <div>
        <DisplayDeck deck={deck} />
      </div>
    </>
  );
}

function DropdownSelector({ label, value, options, onChange }) {
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
function DisplayDeck({deck}) {
  // The deck mainboard may not always be set, so we need
  // to initialize to an empty slice.
  if (!deck || !deck.mainboard) {
    console.log("no deck");
    return null;
  }

  // Create the labels to display.
  let labels = deck.labels.join(', ')
  let acmc = AverageCMC({deck})

  console.log(deck)
  return (
    <>
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
        <td className="player-frame-value">{deck.wins}-{deck.losses}-{deck.ties}</td>
      </tr>
      <tr className="player-frame-row">
        <td className="player-frame-title">Average CMC:</td>
        <td className="player-frame-value">{acmc}</td>
      </tr>
      </tbody>
    </table>

    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 0}} />
    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 1}} />
    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 2}} />
    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 3}} />
    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 4}} />
    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 5}} />
    <CardList player={deck.player} cards={deck.mainboard} opts={{cmc: 6, gt: true}} />
    </>
  );
}

function CardList({ player, cards, opts }) {
  // Figure out how many of this CMC there are.
  let num = 0
  for (var i in cards) {
    // Count the card if it matches the CMC, or if options specify to include
    // all cards greater than the given value.
    if (opts.gt && cards[i].cmc >= opts.cmc || cards[i].cmc == opts.cmc) {
      num += 1
    }
  }
  if (num == 0) {
    return null
  }

  let title = "CMC: " + opts.cmc + " (" + num + ")"
  if (opts.gt) {
    title = "CMC: " + opts.cmc + "+ (" + num + ")"
  }

  // Generate the key for this table.
  let key = {player} + opts.cmc
  return (
    <table key={player} className="decklist">
      <thead className="table-header">{title}</thead>
      <tbody>
      {
        cards.map(function(item) {
          if (opts.gt && item.cmc >= opts.cmc || item.cmc == opts.cmc) {
            return (
              <tr className="card" key={item.name}>
                <td><a href={item.url} target="_blank">{item.name}</a></td>
              </tr>
            )
          }
        })
      }
      </tbody>
    </table>
  );
}

// FetchDeck fetches the deck from the given file and
// calls 'onFetch' upon receipt.
async function FetchDeck(file, onFetch) {
  const resp = await fetch(file);
  const deckData = await resp.json();
  onFetch(deckData);
}

// Returns the average CMC of of cards in the deck,
// excluding basic lands.
function AverageCMC({deck}) {
  if (!deck || !deck.mainboard) {
    return 0;
  }
  let i = 0
  let t = 0
  let c = 0
  while (i < deck.mainboard.length) {
    i++
    // Skip basic lands.
    let card = deck.mainboard[i]
    if (card && !IsBasicLand({card})) {
      t += card.cmc
      c++
    }
  }
  return parseFloat(t / c).toFixed(2)
}

// Returns true if the card is a basic land, and false otherwise.
function IsBasicLand({card}) {
  if (card.types && card.types.includes("Basic")) {
    return true
  }
  return false
}
