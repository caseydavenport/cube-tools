// Pure helpers for checking a card against a group, kept free of React so
// node tests can load them. The server's answer lists every condition with
// its parts marked passed or failed.

// checkSummary is the one-line answer: in the group and why, kept out by the
// exclude list, or not in it.
export function checkSummary(result) {
  if (result.in_group) {
    const matched = result.conditions.find(c => c.matched)
    return `${result.card} is in this group: it matched ${matched.condition}`
  }
  if (result.excluded) {
    return `${result.card} matches, but the group excludes it by name`
  }
  return `${result.card} isn't in this group: no condition matched`
}

// failedConditions lists the conditions the card didn't match, the ones to
// read when working out why it isn't in.
export function failedConditions(result) {
  return result.conditions.filter(c => !c.matched)
}
