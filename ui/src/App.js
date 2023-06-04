import { useState } from "react";
import { useEffect } from "react";

export default function Main() {
  const [data, setData] = useState("");
  const [fetched, setFetched] = useState(false);

  function onFetch(deck) {
    setData(deck)
    console.log(deck)
    setFetched(true)
  }

  useEffect(() => {
    if (!fetched) {
      FetchDeck("drafts/2023-05-31/casey.json", onFetch)
    }
  })

  return DisplayDeck(data)
}


// DisplayDeck prints out the given deck.
function DisplayDeck(deck) {
  // The deck mainboard may not always be set, so we need
  // to initialize to an empty slice.
  let data = []
  if (deck.mainboard) {
    data = deck.mainboard.map(card => (card.name))
  }
  return (
    <>
    <table className="player-frame">
      <tr className="board-row">Player: {deck.player}</tr>
      <tr className="board-row">Deck type(s): {deck.labels}</tr>
      <tr className="board-row">Record:  {deck.wins}-{deck.losses}-{deck.ties}</tr>
    </table>
    <table className="decklist">
      <tbody>
      {
        data.map(item => (<tr key={item}><td>{item}</td></tr>))
      }
      </tbody>
    </table>
    </>
  );
}

function Mainboard(deck) {
  let ret = ""
  ret += `<tr className="board-row">Forest</tr><tr className="board-row">Terra Stomper</tr><tr className="board-row">Maze of Ith</tr>`
  return (ret);

}

// FetchDeck fetches the deck from the given file and
// calls 'onFetch' upon receipt.
async function FetchDeck(file, onFetch) {
  const resp = await fetch(file);
  let a = await resp.json()
  onFetch(a)
}
