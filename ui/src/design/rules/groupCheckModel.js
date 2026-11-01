// Pure helpers for checking a card against a group, kept free of React so
// node tests can load them. The server's answer lists every condition with
// its parts marked passed or failed.

// checkRequest is the group-check body for card against a group that may not
// be saved yet. Blank conditions and excludes, which the editor keeps as empty
// rows, are dropped.
export function checkRequest(card, name, conditions, exclude) {
  const group = {
    name,
    conditions: (conditions || []).map(c => c.trim()).filter(c => c),
    exclude: (exclude || []).filter(n => n),
  }
  return JSON.stringify({ card, group })
}
