import { AverageCMC, ExtractColors } from "../utils/Utils.js"
import { IsBasicLand } from "../utils/Utils.js"

export async function LoadCube(onFetch) {
  const resp = await fetch('cube.json');
  let cube = await resp.json();
  if (onFetch != null) {
    onFetch(cube);
    return
  }
  return cube
}

export async function LoadDecks(onLoad, start, end, draftSize, playerMatch) {
  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchDraftIndex(null)

  let urls = []
  for (var i in idx) {
    // Get the decks for this draft.
    let draft = idx[i]
    if (!isDateBetween(draft.name, start, end)) {
      continue
    }
    let deckIdx = await FetchDeckIndex(draft.name, null)

    // Skip any drafts with fewer than the number of requested decks.
    // This allows skipping of e.g., 2 player grid drafts.
    if (deckIdx.length < draftSize) {
      continue
    }

    for (var j in deckIdx) {
      // For each deck in the draft, add it to the total.
      let deck = deckIdx[j]
      let file = "drafts/" + draft.name + "/" + deck.deck
      let draftName = draft.name

      // Track the file we need to query.
      urls.push(file)
    }
  }

  const requests = urls.map((url) => fetch(url));
  const responses = await Promise.all(requests);
  const errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
      throw errors.map((response) => Error(response.statusText));
  }

  // Do some cleanup on each loaded deck object.
  const json = responses.map((response) => response.json());
  const decks = await Promise.all(json);

  let filtered = new Array()
  for (let d of decks) {
    // Skip decks that don't belong to the specified player name match.
    // This allows us to filter down to a single player's history and perform calculations
    // ignoring decks from any other player.
    if (playerMatch != "") {
      if (!d.player.match(playerMatch)) {
        continue
      }
    }

    d.avg_cmc = AverageCMC({deck: d})
    d.colors = ExtractColors({deck: d})

    // TODO: For historical purposes. We don't actually need both of these fields.
    d.draft = d.date

    // Capitalize player names, since they are varying cases.
    d.player = capitalize(d.player)
    if (d.games != null ) {
      for (let g of d.games) {
        g.opponent = capitalize(g.opponent)
        g.winner = capitalize(g.winner)
      }
    }

    filtered.push(d)
  }

  // Callback with all of the loaded decks.
  onLoad(filtered)
}

function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}

export async function LoadDrafts(onLoad, start, end) {
  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchDraftIndex(null)

  let drafts = []
  for (var i in idx) {
    let draft = idx[i]
    if (!isDateBetween(draft.name, start, end)) {
      continue
    }

    let draftFile = "drafts/" + draft.name + "/draft-log.json";
    const resp = await fetch(draftFile);
    if (!resp.ok) {
      continue
    }

    let d = null
    try {
      d = await resp.json();
    } catch (error) {
      continue
    }

    // Add the date as a field so it can be used in the UI.
    d.date = draft.name

    if (d) {
      drafts.push(d)
    }
  }

  // Callback with all of the loaded decks.
  onLoad(drafts)
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
