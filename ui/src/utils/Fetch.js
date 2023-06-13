import React from 'react'

export async function LoadCube(onFetch) {
  const resp = await fetch('cube.json');
  let cube = await resp.json();
  if (onFetch != null) {
    onFetch(cube);
    return
  }
  return cube
}

export async function LoadDecks(onLoad, start, end) {
  console.log("Loading deck data")

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

// FetchDeck fetches the deck from the given file and
// calls 'onFetch' upon receipt.
export async function FetchDeck(file, onFetch) {
  const resp = await fetch(file);
  let d = await resp.json();

  // Populate the deck with calculated fields and then save the deck.
  d.avg_cmc = AverageCMC({deck: d})
  d.colors = ExtractColors({deck: d})

  onFetch(d);
}

// FetchDraftIndex loads the draft index file from the server.
// The draft index file is an index of all the available drafts
// available on the server.
export async function FetchDraftIndex(onFetch) {
  const resp = await fetch('drafts/index.json');
  let idx = await resp.json();
  if (onFetch != null) {
    onFetch(idx);
    return
  }
  return idx
}

// FetchDeckIndex loads the deck index file from the server.
export async function FetchDeckIndex(draft, onFetch) {
  const resp = await fetch('drafts/' + draft + '/index.json');
  let idx = await resp.json();
  if (onFetch != null) {
    onFetch(idx);
    return
  }
  return idx
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

// Returns the average CMC of of cards in the deck,
// excluding basic lands.
export function AverageCMC({deck}) {
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

// Returns the average CMC of of cards in the deck,
// excluding basic lands.
export function ExtractColors({deck}) {
  if (!deck || !deck.mainboard) {
    return null;
  }
  if (deck.colors) {
    // Decks can override auto-detection by specifying
    // colors explicitly. This is useful if, for example, they only
    // have a single hybrid card and we don't want this deck to count towards that
    // card's colors.
    return deck.colors
  }

  // Calculate the colors based on the card list.
  // Use the basic land types to determine what colors this deck is.
  // This is generally more accurate than basing it off of cards, because oftentimes
  // hybrid cards incorrectly lead the code into thinking a two-color deck is actually three-color.
  let i = 0
  let colors = new Map()
  while (i < deck.mainboard.length) {
    i++
    let card = deck.mainboard[i];
    if (card && IsBasicLand({card})) {
      switch (card.name) {
        case "Forest":
          colors.set("G", true);
          break;
        case "Swamp":
          colors.set("B", true);
          break;
        case "Island":
          colors.set("U", true);
          break;
        case "Plains":
          colors.set("W", true);
          break;
        case "Mountain":
          colors.set("R", true);
          break;
      }
    }
  }
  return Array.from(colors.keys());
}

// Returns true if the card is a basic land, and false otherwise.
export function IsBasicLand({card}) {
  if (card.types && card.types.includes("Basic")) {
    return true
  }
  return false
}
