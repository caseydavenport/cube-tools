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
    { label: "casey", value: "drafts/2023-05-31/casey.json" },
    { label: "jen", value: "drafts/2023-05-31/jen.json" },
    { label: "grant", value: "drafts/2023-05-31/grant.json" },
    { label: "matt", value: "drafts/2023-05-31/matt.json" },
  ]
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
    console.log("Selected deck is new?")
    console.log(event.target.value != selectedDeck)
    setSelectedDeck(event.target.value)
  }
  function onDraftSelected(event) {
    console.log(event.target.value);
    setSelectedDraft(event.target.value)
  }

  // Callback for sucessfully fetching a Deck.
  // This function updates the UI with the deck's contents.
  function onFetch(d) {
    const newdeck = {...d}
    console.log("onFetch called");
    console.log("Deck is new?")
    console.log(newdeck != deck);
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

    // Check if we need to fetch the deck, and if needed do so.
    const cached = fetched.get(selectedDeck)
    if (cached) {
      // We've already fetched and cached this deck.
      console.log("deck is cached")
      onFetch(cached)
    } else {
      // Fetch the deck, since this is the first time
      // we've triggered this.
      console.log("need to fetch deck")
      FetchDeck(selectedDeck, onFetch)
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
  console.log("DisplayDeck")
  console.log(deck)
  return (
    <>
    <table className="player-frame">
      <tbody>
      <tr className="board-row">Player: {deck.player}</tr>
      <tr className="board-row">Deck type(s): {deck.labels}</tr>
      <tr className="board-row">Record:  {deck.wins}-{deck.losses}-{deck.ties}</tr>
      </tbody>
    </table>
    <table key={deck.player} className="decklist">
      <tbody>
      {
        deck.mainboard.map(item => (<tr className="card" key={item.name}><td>{item.name}</td></tr>))
      }
      </tbody>
    </table>
    </>
  );
}

// FetchDeck fetches the deck from the given file and
// calls 'onFetch' upon receipt.
async function FetchDeck(file, onFetch) {
  const resp = await fetch(file);
  const deckData = await resp.json();
  onFetch(deckData);
}
