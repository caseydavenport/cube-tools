// Loading and saving the design rules, and working out which cards each
// group holds and why two cards link.

import { useMemo } from 'react'
import { useCube } from "../../contexts/CubeContext.js"
import { CARD_REF_PREFIX, effectiveCards, matchKey, membershipsByCard, requestForGroups } from "../../utils/DesignRules.js"
import { useDesignMatch } from "../../utils/useDesignMatch.js"
import { RULE_COLORS } from "./ruleColors.js"
import { MAP_COPY } from "./copy.js"

// --- Detail rail (the readable substance) ------------------------------------

// Fetch every card's group memberships once, each with the specific condition(s)
// that matched. Returns name -> [{ group, conds: [...] }]. Used to explain exactly
// why two cards are linked (which group each sits in, via which rule).
export function useAllMemberships(cube, groups) {
  const request = requestForGroups((groups || []).map(g => g.name), groups)
  const { cards } = useDesignMatch(cube, request, { key: matchKey(request, groups) })
  return useMemo(() => membershipsByCard(cards), [cards])
}

// Explain why two cards are linked: for each rule connecting them, the specific
// group each card belongs to (and the condition that put it there).
export function whyLinked(focusCard, neighbor, edges, packageByName, cardGroups) {
  const names = new Set()
  for (const e of edges) {
    const hit = (e.source === focusCard && e.target === neighbor) || (e.target === focusCard && e.source === neighbor)
    if (hit) for (const n of (e.packages || [])) names.add(n)
  }
  const fg = cardGroups[focusCard] || []
  const ng = cardGroups[neighbor] || []
  const groupConds = (mem, name) => { const g = mem.find(x => x.group === name); return g ? g.conds : [] }
  const out = []
  for (const name of names) {
    const pkg = packageByName[name]
    const bridges = []
    if (pkg) {
      const seen = new Set()
      const add = (fGroup, nGroup) => {
        const k = fGroup + ">" + nGroup
        if (seen.has(k)) return
        seen.add(k)
        bridges.push({
          focusGroup: fGroup, neighGroup: nGroup,
          focusConds: groupConds(fg, fGroup), neighConds: groupConds(ng, nGroup),
        })
      }
      // A card can also sit on a wire directly via a card: ref, alongside any
      // group memberships.
      const fgNames = [...fg.map(x => x.group), CARD_REF_PREFIX + focusCard]
      const ngNames = [...ng.map(x => x.group), CARD_REF_PREFIX + neighbor]
      for (const wire of (pkg.wires || [])) {
        for (const s of (wire.sources || [])) {
          for (const t of (wire.targets || [])) {
            if (fgNames.includes(s) && ngNames.includes(t)) add(s, t)
            if (ngNames.includes(s) && fgNames.includes(t)) add(t, s)
          }
        }
      }
    }
    out.push({ name, bridges })
  }
  return out
}

// Fetch which groups a given card belongs to, with the condition(s) that matched.
export function useCardMemberships(cube, cardName, groups) {
  const memberships = useAllMemberships(cube, cardName ? groups : [])
  return useMemo(
    () => (memberships[cardName] || []).map(m => ({ name: m.group, conds: m.conds })),
    [memberships, cardName],
  )
}

export function edgeColorFor(labels, packageIndex) {
  if (labels && labels.length > 0) {
    const idx = packageIndex[labels[0]] ?? 0
    return RULE_COLORS[idx % RULE_COLORS.length]
  }
  return null
}

// editorHref links to the Rules editor's package board searched for card, so
// it shows the packages that use the card. It's a full URL, for opening in a
// new tab.
export function editorHref(cube, card) {
  const p = new URLSearchParams({ q: card })
  return `${window.location.pathname}#/${cube}/rules-editor?${p.toString()}`
}

// saveDesignMap posts the rules. Every cube can save them, since they live in
// a shared file rather than with the cube's decks.
export function saveDesignMap(cube, groups, packages, onRulesChanged, onStatus) {
  fetch(`/api/${cube}/save-design-rules`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ groups, packages }),
  }).then(r => {
    if (r.ok) {
      if (onStatus) onStatus("")
      if (onRulesChanged) onRulesChanged()
    } else {
      if (onStatus) onStatus(MAP_COPY.designData.saveFailed({ reason: r.statusText }))
    }
  }).catch(e => {
    if (onStatus) onStatus(MAP_COPY.designData.saveFailed({ reason: e.message }))
  })
}

// Resolve group names to their combined conditions, then fetch matching cards.
// Cards a group excludes are dropped. Returns {cards: [{name, conditions}], loading}.
export function useFetchGroupCards(selectedGroupNames, allGroups) {
  const cube = useCube()
  const request = requestForGroups(selectedGroupNames, allGroups)
  const { cards, loading } = useDesignMatch(cube, request, { debounceMs: 300, key: matchKey(request, allGroups) })
  return { cards: useMemo(() => effectiveCards(cards), [cards]), loading }
}
