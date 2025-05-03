import { AverageCMC, ExtractColors } from "../utils/Utils.js"
import { IsBasicLand } from "../utils/Utils.js"

export async function LoadCube(onFetch) {
  console.time("LoadCube()")
  const resp = await fetch('data/polyverse/cube.json');
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
  const resp = await fetch(`/api/decks?start=${start}&end=${end}&size=${draftSize}&player=${playerMatch}`);
  let decks = await resp.json();

  // TODO: Move this into the server code, instead of iterate decks here.
  for (let d of decks.decks) {
    d.avg_cmc = AverageCMC({deck: d})
    d.colors = ExtractColors({deck: d})

    // Capitalize player names, since they are varying cases.
    d.player = capitalize(d.player)
    if (d.games != null ) {
      for (let g of d.games) {
        g.opponent = capitalize(g.opponent)
        g.winner = capitalize(g.winner)
      }
    }
  }
  console.timeEnd("LoadDecks()")
  onLoad(decks.decks)
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
  const resp = await fetch('data/polyverse/index.json');
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
