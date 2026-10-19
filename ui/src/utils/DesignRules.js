// Helpers for the design-graph match endpoint, which takes parallel conditions
// and group labels and returns each matching card with the conditions it hit.
// The server marks a condition excluded when the group's saved exclude list
// carves the card out.

// Wire entries are group names, except entries prefixed "card:" which reference
// a single card directly. cardRefName strips the prefix, or returns null for
// plain group entries.
export const CARD_REF_PREFIX = "card:"

export function cardRefName(entry) {
  return entry && entry.startsWith(CARD_REF_PREFIX) ? entry.slice(CARD_REF_PREFIX.length) : null
}

// requestForGroups builds a match request from group names, labeling each
// condition with its group so the server can apply the group's exclusions. A
// card: entry matches that card by name.
export function requestForGroups(names, groups) {
  const byName = {}
  for (const g of (groups || [])) byName[g.name] = g.conditions || []
  const out = { conditions: [], groups: [] }
  for (const name of (names || [])) {
    if (!name) continue
    const refName = cardRefName(name)
    if (refName) {
      out.conditions.push(`n:"${refName}"`)
      out.groups.push(name)
      continue
    }
    for (const c of (byName[name] || [])) {
      if (!c) continue
      out.conditions.push(c)
      out.groups.push(name)
    }
  }
  return out
}

// requestForConditions builds a match request from raw conditions. Naming the
// group lets the server apply its saved exclusions; without one, nothing is
// marked excluded.
export function requestForConditions(conditions, groupName) {
  const conds = (conditions || []).map(c => c.trim()).filter(c => c)
  return { conditions: conds, groups: groupName ? conds.map(() => groupName) : [] }
}

// effectiveCards drops conditions a group excludes, and then cards with no
// conditions left, since those aren't effective members of anything.
export function effectiveCards(cards) {
  return (cards || [])
    .map(c => ({ ...c, conditions: (c.conditions || []).filter(mc => !mc.excluded) }))
    .filter(c => c.conditions.length > 0)
}

// membershipsByCard regroups a response as card name -> [{group, conds}],
// leaving out groups that exclude the card.
export function membershipsByCard(cards) {
  const out = {}
  for (const card of (cards || [])) {
    const byGroup = {}
    for (const mc of (card.conditions || [])) {
      if (!mc.group || mc.excluded) continue
      if (!byGroup[mc.group]) byGroup[mc.group] = []
      byGroup[mc.group].push(mc.condition)
    }
    out[card.name] = Object.entries(byGroup).map(([group, conds]) => ({ group, conds }))
  }
  return out
}

// matchKey identifies a request for refetching. It includes the exclude lists
// of the groups the request names, because the server reads those from the
// saved rules: an exclude-only save changes the answer, not the request.
export function matchKey(request, groups) {
  const named = new Set(request.groups || [])
  const excludes = (groups || [])
    .filter(g => named.has(g.name))
    .map(g => g.name + "=" + (g.exclude || []).join(","))
  return JSON.stringify([request.conditions || [], request.groups || [], excludes])
}
