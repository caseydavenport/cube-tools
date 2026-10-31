// The Rules editor's checks for broken rules, kept free of React so node
// tests can run them.

import { cardRefName } from '../../utils/DesignRules.js'
import { RULES_COPY } from "./copy.js"

// auditRulebook finds the rules that are broken by definition: packages
// naming a missing group or card or with a wire missing a side, groups that
// match no cards, and excludes naming cards not in the cube. The editor
// shows each on the package or group it belongs to.
export function auditRulebook({ packages, groups, groupNames, groupCards, names }) {
  const groupSet = new Set(groupNames)
  const cardSet = new Set(names)
  const brokenPackages = []
  for (const l of packages) {
    const wires = l.wires || []
    const ends = wires.flatMap(w => [...(w.sources || []), ...(w.targets || [])])
    // A card: entry is broken when the named card isn't in the cube (typo, or cut).
    const missing = ends.filter(n => {
      const refName = cardRefName(n)
      return refName ? !cardSet.has(refName) : !groupSet.has(n)
    })
    const oneSided = wires.some(w => !(w.sources || []).length || !(w.targets || []).length)
    if (missing.length || !wires.length || oneSided) {
      brokenPackages.push({ name: l.name, missing })
    }
  }
  const emptyGroups = groupNames.filter(n => (groupCards[n]?.card_count ?? (groupCards[n]?.cards || []).length) === 0)
  // An excluded name not in the cube does nothing — a typo, or a card that
  // was renamed or cut. Same failure mode as a missing card: wire ref.
  const staleExcludes = groups.flatMap(g =>
    (g.exclude || []).filter(n => !cardSet.has(n)).map(n => ({ group: g.name, name: n })))
  return { brokenPackages, emptyGroups, staleExcludes }
}

// groupWarning describes what's wrong with one group, or returns null.
export function groupWarning(audit, name) {
  const msgs = []
  if (audit.emptyGroups.includes(name)) msgs.push(RULES_COPY.rulebookAudit.groupEmpty)
  const stale = audit.staleExcludes.filter(s => s.group === name).map(s => s.name)
  if (stale.length) msgs.push(RULES_COPY.rulebookAudit.staleExcludes({ count: stale.length, names: stale.join(', ') }))
  return msgs.length ? msgs.join('; ') : null
}

// packageWarning describes what's wrong with one package, or returns null.
export function packageWarning(audit, label) {
  const b = audit.brokenPackages.find(x => x.name === label)
  if (!b) return null
  return b.missing.length ? RULES_COPY.rulebookAudit.packageMissing(b.missing.join(', ')) : RULES_COPY.rulebookAudit.packageOneSided
}
