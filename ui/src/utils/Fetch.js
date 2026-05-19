import { AverageCMC, AverageWordCount, ExtractColors } from "../utils/Utils.js"
import { IsBasicLand } from "../utils/Utils.js"

export async function LoadCube(cube, onFetch) {
  const resp = await fetch(`/api/${cube}/cube`);
  let c = await resp.json();
  if (onFetch != null) {
    onFetch(c);
    return
  }
  return c
}

export async function LoadDecks(cube, onLoad, start, end, draftSize, playerMatch, match) {
  const resp = await fetch(`/api/${cube}/decks?start=${start}&end=${end}&size=${draftSize}&player=${playerMatch}&match=${encodeURIComponent(match || "")}`);
  let decks = await resp.json();

  // TODO: Move this into the server code, instead of iterate decks here.
  for (let d of decks.decks) {
    d.avg_cmc = AverageCMC({deck: d})
    d.avg_word_count = AverageWordCount({deck: d})
    d.colors = ExtractColors({deck: d})

    // Avoid nil errors.
    if (d.matches === null) {
      d.matches = []
    }
  }

  onLoad(decks.decks)
}

export async function LoadArchetypeData(cube, onLoad, start, end, draftSize, playerMatch, match) {
  const resp = await fetch(`/api/${cube}/archetypes?start=${start}&end=${end}&size=${draftSize}&player=${playerMatch}&match=${encodeURIComponent(match || "")}`);
  let d = await resp.json();
  onLoad(d)
}

export async function LoadDrafts(cube, onLoad, start, end) {
  // First, fetch the draft index. We'll use this to find
  // all the drafts and decks therein.
  let idx = await FetchIndex(cube, null)

  let ids = []
  idx.drafts.forEach(function(draft, i) {
    if (!isDateBetween(draft.date, start, end)) {
      return
    }
    if (draft.draft_log === "") {
      return
    }
    ids.push(draft.draft_id)
  })

  // Query draft logs in parallel.
  let requests = ids.map((id) => fetch(`/api/${cube}/drafts/${id}/log`));
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

// FetchNotes returns the raw contents of a notes file under data/{cube}/.
export async function FetchNotes(cube, path, onFetch) {
  const resp = await fetch(`/api/${cube}/notes?path=${encodeURIComponent(path)}`);
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
export async function SaveNotes(cube, path, content) {
  const resp = await fetch(`/api/${cube}/save-notes`, {
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
export async function FetchIndex(cube, onFetch) {
  const resp = await fetch(`/api/${cube}/index`);
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
