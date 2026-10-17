// DraftInfo labels, orders, and searches the draft object the API attaches to
// each deck and index entry ({id, date, event_name, event_code, flight}). It
// has no imports so it can be unit-tested under node directly.

// draftLabel is the human name for a draft, wherever the UI shows one.
export function draftLabel(draft) {
  if (!draft) {
    return ""
  }
  const name = draft.event_name || `#${draft.id}`
  const flight = draft.flight ? ` (${draft.flight})` : ""
  return `${draft.date} · ${name}${flight}`
}

// compareDrafts orders drafts by date, then by numeric id for same-day drafts.
export function compareDrafts(a, b) {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1
  }
  return a.id - b.id
}

// eventTerms returns the draft fields that an event: search or a free-text
// search matches against, the same fields the server matches.
export function eventTerms(draft) {
  if (!draft) {
    return []
  }
  return [draft.event_code, draft.event_name, draft.flight].filter(Boolean)
}
