// Pure helpers behind the Scryfall tag pickers (group editor, Cards page),
// kept free of React so node tests can load them.

// tagOptions turns the cube's tags from /stats/tags into picker options, in
// the order the server sends them (most cube cards first).
export function tagOptions(tags) {
  if (!tags) {
    return []
  }
  return tags.map(tag => ({
    value: tag.slug,
    label: `${tag.slug} (${tag.cards})`,
    description: tag.description,
  }))
}

// addTagCondition puts an otag: condition for slug into the first empty
// condition box, or adds a new box when every box is filled.
export function addTagCondition(conditions, slug) {
  const condition = `otag:${slug}`
  const next = [...conditions]
  const empty = next.findIndex(c => c.trim() === "")
  if (empty === -1) {
    next.push(condition)
  } else {
    next[empty] = condition
  }
  return next
}

// distinctiveLabel is a distinctive tag's chip text: the tag, how many cube
// cards carry it, and how many times more common it is than across Magic.
export function distinctiveLabel(row) {
  return `${row.slug} · ${row.cards} cards · ${Math.round(row.lift)}×`
}
