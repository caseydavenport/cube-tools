// The logic behind the deck page's pencil edits: what a save sends, how a
// failed save is described, and how colors and tags change. Pure functions,
// tested in deckEdits.test.mjs.

const COLOR_ORDER = ["W", "U", "B", "R", "G"]

// annotationPayload is the body of a deck annotation save. The server replaces
// the archetype, tags, and colors together, so any the change leaves out are
// sent as they are now. Notes are the exception: left out, they're omitted,
// and the server keeps the stored notes.
export function annotationPayload(deck, changes) {
  let macro = deck.macro_archetype || ""
  if (changes.macro !== undefined) {
    macro = changes.macro
  }

  let labels = deck.labels || []
  if (changes.labels !== undefined) {
    labels = changes.labels
  }

  let colors = deck.colors_override || []
  if (changes.colors !== undefined) {
    colors = changes.colors
  }

  return {
    draft_id: deck.metadata.draft_id,
    id: deck.id,
    macro_archetype: macro,
    labels,
    colors,
    notes: changes.notes,
  }
}

// saveErrorText is the message shown when a save fails, naming the field and
// the server's reason.
export function saveErrorText(what, error) {
  return `${what} couldn't be saved: ${error.message}`
}

// toggleColor adds a color to a deck's colors or removes it, keeping WUBRG
// order.
export function toggleColor(colors, color) {
  const next = new Set(colors)
  if (next.has(color)) {
    next.delete(color)
  } else {
    next.add(color)
  }
  return COLOR_ORDER.filter(c => next.has(c))
}

// addTag adds a typed tag to the list, trimmed. Blank and duplicate tags leave
// the list as it was.
export function addTag(tags, raw) {
  const tag = raw.trim()
  if (tag === "" || tags.includes(tag)) {
    return tags
  }
  return [...tags, tag]
}

// removeTag drops a tag from the list.
export function removeTag(tags, tag) {
  return tags.filter(t => t !== tag)
}
