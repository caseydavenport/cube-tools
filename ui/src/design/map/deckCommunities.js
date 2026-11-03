// A deck's communities: groups of its cards the design rules link more to
// each other than to the rest, each named by its strongest package. The Map
// view colors cards by them and the deck's header lists them.

import { buildDeckSubgraph, dominantLabel } from "../../utils/DeckGraph.js"
import { buildMapGraph, findCommunities, groupCommunities } from "../../components/map/mapGraph.js"
import { RULE_COLORS, ruleColor } from "./ruleColors.js"

// deckCommunities splits a pool of card names into communities by the design
// graph's edges. It returns the pool's subgraph, the named communities (label,
// color, size, members; largest first) and each card's community color.
// Single cards and communities with no package link inside them get no color
// and aren't listed. A community is colored by its package, so a package looks
// the same across decks; when two want one color, the smaller takes the next
// free one.
export function deckCommunities(names, edges, packageIndex) {
  const graph = buildDeckSubgraph(names, edges || [])
  const poolGraph = buildMapGraph(names.map(name => ({ id: name })), edges || [])
  const communities = groupCommunities(findCommunities(poolGraph))

  const colorOf = {}
  const list = []
  const used = new Set()
  for (const members of communities) {
    let label = ""
    if (members.length >= 2) {
      label = dominantLabel(graph, members)
    }
    if (!label) {
      for (const name of members) {
        colorOf[name] = null
      }
      continue
    }

    let color = ruleColor(packageIndex[label] ?? 0)
    if (used.has(color)) {
      const free = RULE_COLORS.find(c => !used.has(c))
      if (free) {
        color = free
      }
    }
    used.add(color)
    for (const name of members) {
      colorOf[name] = color
    }
    list.push({ color, label, size: members.length, members })
  }
  return { graph, list, colorOf }
}
