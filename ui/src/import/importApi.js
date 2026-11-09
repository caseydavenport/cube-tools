// importApi wraps the server endpoints the import pages use: parsing and
// committing decklists, creating drafts from Hedron or a photo folder, and the
// photo review's drafts, scans and saved work. Every helper throws on an error
// status, with the server's own message, so a page can show what went wrong.

// failure builds the error for a response with an error status, preferring the
// server's message over the bare status line.
async function failure(response) {
  const text = await response.text()
  if (text) {
    return new Error(text.trim())
  }
  return new Error(`${response.status} ${response.statusText}`)
}

// getJSON fetches a URL and returns its parsed JSON body.
async function getJSON(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw await failure(response)
  }
  return response.json()
}

// post sends body as JSON and returns the raw response, after checking its
// status. Most callers want postJSON; this is for endpoints with no body.
async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await failure(response)
  }
  return response
}

// postJSON sends body as JSON and returns the parsed JSON reply.
async function postJSON(url, body) {
  const response = await post(url, body)
  return response.json()
}

// ---- Decklists ----

// loadCubeCards lists the cube's cards for the decklist review's card search.
export async function loadCubeCards(cube) {
  const reply = await getJSON(`/api/${cube}/import/cards`)
  return reply.cards || []
}

// parseDecklists parses pasted or uploaded decklists. sources is a list of
// {player, filename, content}. It returns {decks, report}.
export function parseDecklists(cube, sources) {
  return postJSON(`/api/${cube}/import/parse`, { sources })
}

// checkDecks re-checks edited decks against the cube list and returns the
// consistency report.
export function checkDecks(cube, decks) {
  return postJSON(`/api/${cube}/import/check`, { decks })
}

// commitDraft writes the reviewed decks as a new draft. payload is
// {date, event_name, event_code, decks}. It returns the new draft's id.
export async function commitDraft(cube, payload) {
  const reply = await postJSON(`/api/${cube}/import/commit`, payload)
  return reply.draft_id
}

// ---- New photo drafts ----

// listHedronDrafts lists the drafts Hedron has for a CubeCobra cube id.
export async function listHedronDrafts(cube, cubeCobraId) {
  const reply = await getJSON(`/api/${cube}/import/hedron?cubeId=${encodeURIComponent(cubeCobraId)}`)
  return reply.drafts || []
}

// importHedronDraft copies one Hedron draft's photos into this cube and
// returns the new draft's id.
export async function importHedronDraft(cube, cubeCobraId, hedronDraftId) {
  const reply = await postJSON(`/api/${cube}/import/hedron`, {
    cube_id: cubeCobraId,
    draft_id: hedronDraftId,
  })
  return reply.draft_id
}

// createPhotoDraft uploads deck photos, one per player, and builds a draft from
// them. fields is {date, slug, event_name, flight}; images is a list of File.
// It returns the new draft's id.
export async function createPhotoDraft(cube, fields, images) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value)
  }
  for (const image of images) {
    form.append("images", image, image.name)
  }

  // No Content-Type header: the browser adds the multipart boundary itself.
  const response = await fetch(`/api/${cube}/import/photos`, { method: "POST", body: form })
  if (!response.ok) {
    throw await failure(response)
  }
  const reply = await response.json()
  return reply.draft_id
}

// ---- Photo review ----

// photoURL is the address of one draft photo. version is bumped each time the
// photo is rotated, so the browser fetches the rewritten file.
export function photoURL(cube, draftId, photo, version) {
  const base = `/api/${cube}/ocr/drafts/${draftId}/img/${photo}`
  if (version) {
    return `${base}?v=${version}`
  }
  return base
}

// draftURL is the base address of one photo draft's endpoints.
function draftURL(cube, draftId) {
  return `/api/${cube}/ocr/drafts/${draftId}`
}

// loadPhotoDrafts lists every draft with photos, newest first, with each
// one's progress counts.
export async function loadPhotoDrafts(cube) {
  const reply = await getJSON(`/api/${cube}/ocr/drafts`)
  return reply.drafts || []
}

// loadPhotoDraft loads one draft's seats, photos and progress.
export function loadPhotoDraft(cube, draftId) {
  return getJSON(draftURL(cube, draftId))
}

// loadDraftCards lists the cards of the cube the draft was played with, for
// the photo review's card search.
export async function loadDraftCards(cube, draftId) {
  const reply = await getJSON(`${draftURL(cube, draftId)}/cards`)
  return reply.cards || []
}

// loadConsistency compares every seat's cards against the cube list.
export function loadConsistency(cube, draftId) {
  return getJSON(`${draftURL(cube, draftId)}/consistency`)
}

// detectPhoto finds and reads every card name on one photo. It returns the
// detected lines.
export async function detectPhoto(cube, draftId, photo) {
  const reply = await postJSON(`${draftURL(cube, draftId)}/detect`, { photo })
  return reply.lines || []
}

// rotatePhoto turns a photo 90 degrees in place. direction is "cw" or "ccw".
export async function rotatePhoto(cube, draftId, photo, direction) {
  await post(`${draftURL(cube, draftId)}/rotate`, { photo, direction })
}

// matchRegion reads the card name inside one hand-drawn box on a photo.
export function matchRegion(cube, draftId, photo, box) {
  return postJSON(`${draftURL(cube, draftId)}/region`, { photo, box })
}

// startDraftScan starts a background scan of every photo in the draft that
// has no boxes yet, and returns the scan's progress.
export function startDraftScan(cube, draftId) {
  return postJSON(`${draftURL(cube, draftId)}/scan`, {})
}

// getDraftScan reports the progress of the draft's background scan.
export function getDraftScan(cube, draftId) {
  return getJSON(`${draftURL(cube, draftId)}/scan`)
}

// loadSession loads the draft's saved review work for every seat.
export function loadSession(cube, draftId) {
  return getJSON(`${draftURL(cube, draftId)}/session`)
}

// saveSession saves review work for the seats in session.players, leaving
// other seats as they were. It returns the merged session.
export function saveSession(cube, draftId, session) {
  return postJSON(`${draftURL(cube, draftId)}/session`, session)
}

// confirmSeat writes a seat's reviewed cards as its deck.
export async function confirmSeat(cube, draftId, seat, payload) {
  await post(`${draftURL(cube, draftId)}/players/${seat}/confirm`, payload)
}
