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

// decorateDeck applies the client-side derived fields the UI expects on every
// deck. colors_override preserves the raw server override (absent when the deck
// uses inferred colors) because ExtractColors below overwrites d.colors with the
// effective color list.
export function decorateDeck(d) {
  d.avg_cmc = AverageCMC({deck: d})
  d.avg_word_count = AverageWordCount({deck: d})
  d.colors_override = (d.colors && d.colors.length) ? d.colors : null
  d.colors = ExtractColors({deck: d})
  if (d.matches === null) {
    d.matches = []
  }
  return d
}

export async function LoadDecks(cube, onLoad, start, end, draftSize, playerMatch, match, board) {
  const resp = await fetch(`/api/${cube}/decks?start=${start}&end=${end}&size=${draftSize}&player=${playerMatch}&match=${encodeURIComponent(match || "")}&board=${encodeURIComponent(board || "")}`);
  let decks = await resp.json();

  // TODO: Move this into the server code, instead of iterate decks here.
  let list = decks.decks || []
  for (let d of list) {
    decorateDeck(d)
  }

  onLoad(list)
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

  // A cube with no drafts yet serves {"drafts": null}, so default to empty.
  let withLogs = (idx.drafts || []).filter((draft) => draft.has_log && isDateBetween(draft.date, start, end))

  // Query draft logs in parallel.
  let requests = withLogs.map((draft) => fetch(`/api/${cube}/drafts/${draft.id}/log`));
  let responses = await Promise.all(requests);
  let errors = responses.filter((response) => !response.ok);
  if (errors.length > 0) {
      throw errors.map((response) => Error(response.statusText));
  }
  let json = responses.map(function(response) { return response.json() });
  let draftResponses = await Promise.all(json);

  // Attach the draft each log belongs to, in the same shape decks carry.
  let drafts = []
  draftResponses.forEach(function(resp, i) {
    const { id, date, event_name, event_code, flight } = withLogs[i]
    resp.draft = { id, date, event_name, event_code, flight }
    drafts.push(resp)
  })

  // Callback with all of the loaded decks.
  onLoad(drafts)
}

// SaveDeckMeta writes a deck's annotations (macro archetype, labels, color
// override, notes) for the deck identified by (draft_id, id) and returns the
// updated, decorated deck. notes is optional: omitted (undefined) it drops out
// of the JSON body and the server leaves the existing notes untouched. A failed
// save throws with the server's message.
export async function SaveDeckMeta(cube, { draft_id, id, macro_archetype, labels, colors, notes }) {
  const resp = await fetch(`/api/${cube}/decks/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ draft_id, id, macro_archetype, labels, colors, notes }),
  });
  if (!resp.ok) {
    let message = (await resp.text()).trim();
    if (message === "") {
      message = "Failed to save deck metadata";
    }
    throw new Error(message);
  }
  let d = await resp.json();
  return decorateDeck(d);
}

// SaveDeckRecord writes a deck's player and match record, mirroring results
// onto opponents server-side. It returns every deck the server changed, each
// decorated. player_id (0 for an anonymous seat) and matches are optional:
// omitted (undefined) they drop out of the JSON body and the server leaves
// that field unchanged. A failed save throws with the server's message.
export async function SaveDeckRecord(cube, { draft_id, id, player_id, matches }) {
  const resp = await fetch(`/api/${cube}/decks/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ draft_id, id, player_id, matches }),
  });
  if (!resp.ok) {
    throw new Error((await resp.text()).trim() || "Failed to save deck record");
  }
  const data = await resp.json();
  return (data.decks || []).map(decorateDeck);
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
