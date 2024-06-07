import { AverageCMC, ExtractColors } from "../utils/Utils.js"
import { IsBasicLand } from "../utils/Utils.js"

export async function LoadCube(onFetch) {
  console.time("LoadCube()")
  const resp = await fetch('cube.json');
  let cube = await resp.json();
  console.timeEnd("LoadCube()")
  if (onFetch != null) {
    onFetch(cube);
    return
  }
  return cube
}

export async function LoadDecks(onLoad, start, end, draftSize, playerMatch) {
  console.time("LoadDecks()")

  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchDraftIndex(null)

  // Fetch all of the deck indicies in parallel.
  let idxURLs = new Array()
  let drafts = new Array()
  for (var i in idx) {
    // Get the decks for this draft.
    let draft = idx[i]
    if (!isDateBetween(draft.name, start, end)) {
      continue
    }
    idxURLs.push('drafts/' + draft.name + '/index.json');
    drafts.push(draft.name)
  }
  let requests = idxURLs.map((url) => fetch(url));
  let responses = await Promise.all(requests);
  let errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
      throw errors.map((response) => Error(response.statusText));
  }
  let json = responses.map((response) => response.json());
  let deckIndicies = await Promise.all(json);

  let urls = []
  // for (let deckIdx of deckIndicies) {
  deckIndicies.forEach(function(deckIdx, idx) {
    // Skip any drafts with fewer than the number of requested decks.
    // This allows skipping of e.g., 2 player grid drafts.
    if (deckIdx.length < draftSize) {
      return
    }

    for (var j in deckIdx) {
      // For each deck in the draft, add it to the total.
      let deck = deckIdx[j]
      let date = drafts[idx]
      let file = "drafts/" + date + "/" + deck.deck

      // Track the file we need to query.
      urls.push(file)
    }
  })

  requests = urls.map((url) => fetch(url));
  responses = await Promise.all(requests);
  errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
      throw errors.map((response) => Error(response.statusText));
  }

  // Do some cleanup on each loaded deck object.
  json = responses.map((response) => response.json());
  let decks = await Promise.all(json);

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
  console.timeEnd("LoadDecks()")
  onLoad(filtered)
}

function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}

export async function LoadDrafts(onLoad, start, end) {
  console.time("LoadDrafts()")

  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchDraftIndex(null)

  let urls = []
  let dates = []
  for (var i in idx) {
    let draft = idx[i]
    if (!isDateBetween(draft.name, start, end)) {
      continue
    }

    urls.push("drafts/" + draft.name + "/draft-log.json");
    dates.push(draft.name)
  }

  // Query URLs in parallel.
  let requests = urls.map((url) => fetch(url));
  let responses = await Promise.all(requests);
  let errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
    console.log("Failed to load one or more draft logs");
  }
  let json = responses.map(function(response) {
    if (!response.ok) {
      // We don't expect every request to succeed. We don't want to filter these out though,
      // so that the response array lines up with the dates array calcualted earlier.
      return {error: true};
    }
    return response.json()
  });
  let draftResponses = await Promise.all(json);

  let drafts = []
  draftResponses.forEach(function(resp, idx) {
    if (resp.error) {
      // Skip any responses that errored.
      return
    }

    // Add the date as a field so it can be used in the UI.
    resp.date = dates[idx]
    drafts.push(resp)
  })

  // Callback with all of the loaded decks.
  console.timeEnd("LoadDrafts()")
  onLoad(drafts)
}

// FetchDraftIndex loads the draft index file from the server.
// The draft index file is an index of all the available drafts
// available on the server.
export async function FetchDraftIndex(onFetch) {
  console.time("FetchDraftIndex()")
  const resp = await fetch('drafts/index.json');
  let idx = await resp.json();
  if (onFetch != null) {
    onFetch(idx);
    return
  }
  console.timeEnd("FetchDraftIndex()")
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
