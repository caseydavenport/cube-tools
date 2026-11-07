// Loading and saving the design rules, and working out which cards each
// group holds.

import { useMemo } from 'react'
import { useCube } from "../../contexts/CubeContext.js"
import { effectiveCards, matchKey, membershipsByCard, requestForGroups } from "../../utils/DesignRules.js"
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
