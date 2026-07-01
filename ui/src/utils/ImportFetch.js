// ImportFetch wraps the /api/{cube}/import endpoints. Each helper returns
// parsed JSON and throws on a non-2xx response so callers can surface the
// server's error text.

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function LoadImportCards(cube) {
  const r = await fetch(`/api/${cube}/import/cards`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).cards || [];
}

// ParseDecklists parses pasted/uploaded decklists. sources is
// [{player, filename, content, format}]. Returns {decks, report}.
export function ParseDecklists(cube, sources) {
  return postJSON(`/api/${cube}/import/parse`, { sources });
}

// ParseDir parses a server-side directory of deck files. req is
// {dir, filetype, prefix}. Returns {decks, report}.
export function ParseDir(cube, req) {
  return postJSON(`/api/${cube}/import/parse-dir`, req);
}

// CheckDecks re-validates edited decks against the cube. Returns a report.
export function CheckDecks(cube, decks) {
  return postJSON(`/api/${cube}/import/check`, { decks });
}

// CommitDraft writes the reviewed draft. payload is
// {draft_id, date, event_name, decks}. Returns {draft_id}.
export function CommitDraft(cube, payload) {
  return postJSON(`/api/${cube}/import/commit`, payload);
}

// ListHedronDrafts lists the drafts Hedron has for a CubeCobra cube id.
export async function ListHedronDrafts(cube, cubeCobraId) {
  const r = await fetch(`/api/${cube}/import/hedron?cubeId=${encodeURIComponent(cubeCobraId)}`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).drafts || [];
}

// ImportHedronDraft imports one Hedron draft into the current cube and returns
// the local draft id to open in the OCR flow.
export async function ImportHedronDraft(cube, cubeCobraId, hedronDraftId) {
  const { draft_id } = await postJSON(`/api/${cube}/import/hedron`, {
    cube_id: cubeCobraId, draft_id: hedronDraftId,
  });
  return draft_id;
}
