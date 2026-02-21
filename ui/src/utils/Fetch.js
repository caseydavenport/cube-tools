import { AverageCMC, ExtractColors } from "../utils/Utils.js"
import { IsBasicLand } from "../utils/Utils.js"

export async function LoadCube(onFetch) {
  const resp = await fetch('data/polyverse/cube.json');
  let cube = await resp.json();
  if (onFetch != null) {
    onFetch(cube);
    return
  }
  return cube
}

export async function LoadDecks(onLoad, start, end, draftSize, playerMatch, match) {
  const resp = await fetch(`/api/decks?start=${start}&end=${end}&size=${draftSize}&player=${playerMatch}&match=${encodeURIComponent(match || "")}`);
  let decks = await resp.json();

  // TODO: Move this into the server code, instead of iterate decks here.
  for (let d of decks.decks) {
    d.avg_cmc = AverageCMC({deck: d})
    d.colors = ExtractColors({deck: d})

    // Avoid nil errors.
    if (d.matches === null) {
      d.matches = []
    }
  }

  onLoad(decks.decks)
}

export async function LoadArchetypeData(onLoad, start, end, draftSize, playerMatch, match) {
  const resp = await fetch(`/api/archetypes?start=${start}&end=${end}&size=${draftSize}&player=${playerMatch}&match=${encodeURIComponent(match || "")}`);
  let d = await resp.json();
  onLoad(d)
}

export async function LoadDrafts(onLoad, start, end) {
  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchIndex(null)

  let urls = []
  let ids = []
  idx.drafts.forEach(function(draft, i) {
    if (!isDateBetween(draft.date, start, end)) {
      return
    }
    if (draft.draft_log === "") {
      return
    }
    urls.push(draft.draft_log)
    ids.push(draft.draft_id)
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
    // TODO: Rename this field from date -> id
    resp.date = ids[idx]
    drafts.push(resp)
  })

  // Callback with all of the loaded decks.
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

// SaveNotes saves the given content to the specified path.
export async function SaveNotes(path, content) {
  const resp = await fetch("/api/save-notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, content }),
  });
  if (!resp.ok) {
    throw new Error("Failed to save notes");
  }
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
