// The Rules editor's health checks over the rulebook, kept free of React so
// node tests can run them.

import { cardRefName } from '../../utils/DesignRules.js'
import { RULES_COPY } from "./copy.js"

// auditRulebook runs the editor's health checks. Structural issues (wrong by
// definition, like a link naming a missing group) are counted in structural for
// the toolbar badge; the coverage lists (judgment calls) only show on the audit
// board. ungroupedCards and isolatedCards are null while memberships are
// still loading.
export function auditRulebook({ links, groups, groupNames, groupCards, names, cardGroups, membershipsLoading, neighborsOf }) {
  const groupSet = new Set(groupNames)
  const cardSet = new Set(names)
  const referenced = new Set()
  const brokenLinks = []
  for (const l of links) {
    const wires = l.wires || []
    const ends = wires.flatMap(w => [...(w.sources || []), ...(w.targets || [])])
    ends.forEach(n => referenced.add(n))
    // A card: entry is broken when the named card isn't in the cube (typo, or cut).
    const missing = ends.filter(n => {
      const refName = cardRefName(n)
      return refName ? !cardSet.has(refName) : !groupSet.has(n)
    })
    const oneSided = wires.some(w => !(w.sources || []).length || !(w.targets || []).length)
    if (missing.length || !wires.length || oneSided) {
      brokenLinks.push({ label: l.label, missing })
    }
  }
  // The same group pair wired by more than one link — the edges are identical,
  // so it's usually two rules that drifted into overlap. Direction ignored:
  // A->B and B->A produce the same card edges.
  const pairLinks = {}
  for (const l of links) {
    for (const w of (l.wires || [])) {
      for (const s of (w.sources || [])) {
        for (const t of (w.targets || [])) {
          const key = [s, t].sort().join('|')
          ;(pairLinks[key] = pairLinks[key] || new Set()).add(l.label)
        }
      }
    }
  }
  const duplicatePairs = Object.entries(pairLinks)
    .filter(([, labels]) => labels.size > 1)
    .map(([key, labels]) => ({ key, groups: key.split('|'), labels: [...labels].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key))
  // Two groups whose memberships nearly coincide — usually the same idea
  // captured twice by slightly different queries. Jaccard >= 0.75 keeps
  // deliberate thematic overlap (~50%) out of the list.
  const memberSets = groupNames.map(n => [n, new Set(groupCards[n]?.cards || [])])
  const similarGroups = []
  for (let i = 0; i < memberSets.length; i++) {
    const [an, as] = memberSets[i]
    if (as.size === 0) continue
    for (let j = i + 1; j < memberSets.length; j++) {
      const [bn, bs] = memberSets[j]
      if (bs.size === 0) continue
      let shared = 0
      for (const c of as) if (bs.has(c)) shared++
      const jaccard = shared / (as.size + bs.size - shared)
      if (jaccard >= 0.75) similarGroups.push({ a: an, b: bn, shared, pct: Math.round(jaccard * 100) })
    }
  }
  similarGroups.sort((x, y) => y.pct - x.pct)
  const unlinkedGroups = groupNames.filter(n => !referenced.has(n))
  const emptyGroups = groupNames.filter(n => (groupCards[n]?.card_count ?? (groupCards[n]?.cards || []).length) === 0)
  // An excluded name not in the cube does nothing — a typo, or a card that
  // was renamed or cut. Same failure mode as a missing card: wire ref.
  const staleExcludes = groups.flatMap(g =>
    (g.exclude || []).filter(n => !cardSet.has(n)).map(n => ({ group: g.name, name: n })))
  // A card named directly on a wire gets edges without any group, so it isn't
  // invisible to the map - leave it off the ungrouped list.
  const directlyWired = new Set([...referenced].map(cardRefName).filter(Boolean))
  const ungroupedCards = membershipsLoading ? null : names.filter(n => !(cardGroups[n] || []).length && !directlyWired.has(n))
  const isolatedCards = membershipsLoading ? null :
    names.filter(n => (cardGroups[n] || []).length > 0 && !(neighborsOf[n] || []).length)
  const structural = brokenLinks.length + unlinkedGroups.length + emptyGroups.length + staleExcludes.length
  return { brokenLinks, duplicatePairs, similarGroups, unlinkedGroups, emptyGroups, staleExcludes, ungroupedCards, isolatedCards, structural }
}

// groupWarning describes what's wrong with one group, or returns null.
export function groupWarning(audit, name) {
  const msgs = []
  if (audit.emptyGroups.includes(name)) msgs.push(RULES_COPY.rulebookAudit.groupEmpty)
  if (audit.unlinkedGroups.includes(name)) msgs.push(RULES_COPY.rulebookAudit.groupUnlinked)
  const stale = audit.staleExcludes.filter(s => s.group === name).map(s => s.name)
  if (stale.length) msgs.push(RULES_COPY.rulebookAudit.staleExcludes({ count: stale.length, names: stale.join(', ') }))
  return msgs.length ? msgs.join('; ') : null
}

// linkWarning describes what's wrong with one link, or returns null.
export function linkWarning(audit, label) {
  const b = audit.brokenLinks.find(x => x.label === label)
  if (!b) return null
  return b.missing.length ? RULES_COPY.rulebookAudit.linkMissing(b.missing.join(', ')) : RULES_COPY.rulebookAudit.linkOneSided
}
