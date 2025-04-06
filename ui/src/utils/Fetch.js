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
  let idx = await FetchIndex(null)

  let urls = []
  idx.drafts.forEach(function(draft, i) {
    if (!isDateBetween(draft.date, start, end)) {
      return
    }

    // Skip any drafts with fewer than the number of requested decks.
    // This allows skipping of e.g., 2 player grid drafts.
    if (draft.decks.length < draftSize) {
      return
    }

    draft.decks.forEach(function(deck, j) {
      // Track the file we need to query.
      urls.push(deck.path)
    })
  })

  let requests = urls.map((url) => fetch(url));
  let responses = await Promise.all(requests);
  let errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
      throw errors.map((response) => Error(response.statusText));
  }

  // Do some cleanup on each loaded deck object.
  let json = responses.map((response) => response.json());
  let decks = await Promise.all(json);

  // Assign a unique ID to each deck.
  let id = 0

  let filtered = new Array()
  for (let d of decks) {
    // Skip decks that don't belong to the specified player name match.
    // This allows us to filter down to a single player's history and perform calculations
    // ignoring decks from any other player.
    if (playerMatch != "") {
      if (!d.player.toLowerCase().match(playerMatch.toLowerCase())) {
        continue
      }
    }

    d.avg_cmc = AverageCMC({deck: d})
    d.colors = ExtractColors({deck: d})

    if (d.date != d.draft) {
      console.log("Deck date does not match draft date: " + d.date + " != " + d.draft)
    }

    // TODO: For historical purposes. We don't actually need both of these fields.
    // TODO: Distinguish between date and draft! Multiple drafts on the same date!
    d.draft = d.date

    // Set a unique ID for this deck.
    d.id = d.draft + "/" + d.player + "/" + id
    id += 1

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
  let idx = await FetchIndex(null)

  let urls = []
  let dates = []
  idx.drafts.forEach(function(draft, i) {
    if (!isDateBetween(draft.date, start, end)) {
      return
    }
    if (draft.draft_log === "") {
      return
    }
    urls.push(draft.draft_log)
    dates.push(draft.date)
  })

  // Query URLs in parallel.
  let requests = urls.map((url) => fetch(url));
  let responses = await Promise.all(requests);
  let errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
      throw errors.map((response) => Error(response.statusText));
  }
  let json = responses.map(function(response) { return response.json() });
  let draftResponses = await Promise.all(json);

  let drafts = []
  draftResponses.forEach(function(resp, idx) {
    // Add the date as a field so it can be used in the UI.
    resp.date = dates[idx]
    drafts.push(resp)
  })

  // Callback with all of the loaded decks.
  console.timeEnd("LoadDrafts()")
  onLoad(drafts)
}

// FetchFile returns the raw contents of the file.
export async function FetchFile(path, onFetch) {
  const resp = await fetch(path);
  let txt = await resp.text();
  if (resp.status != 200) {
    txt = ""
  }
  if (onFetch != null) {
    onFetch(txt);
    return
  }
  return txt;
}

// FetchIndex loads the draft index file from the server.
// The draft index file is an index of all the available drafts
// available on the server.
export async function FetchIndex(onFetch) {
  const resp = await fetch('drafts/index.json');
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
