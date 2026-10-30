// Deck-subgraph analytics for the Map view, ported from the hack/deckgraph Go
// prototype. The analytics are pure and deterministic (sorted nodes, lexical
// tie-breaks) so repeated renders produce identical output. Only neutralColor
// reads the screen, for the color scheme.

import { currentChartTheme } from "../theme/chartTheme.js"

// neutralColor is the muted theme color for nodes with no community color. It
// is read when called, so it follows the light or dark scheme on screen.
function neutralColor() {
  return currentChartTheme().muted
}

// buildDeckSubgraph induces the subgraph on `names` from the cube-wide edge
// list. An edge survives only when both endpoints are in the name set; every
// name becomes a node even with no surviving edges. Each edge is normalized so
// a < b with its package names sorted.
export function buildDeckSubgraph(names, edges) {
  const inDeck = new Set(names)
  const nodes = [...new Set(names)].sort()
  const adj = {}
  for (const n of nodes) adj[n] = {}
  const subEdges = []
  for (const e of edges || []) {
    const s = e.source
    const t = e.target
    if (!inDeck.has(s) || !inDeck.has(t) || s === t) continue
    let a = s
    let b = t
    if (a > b) {
      a = t
      b = s
    }
    const labels = [...(e.packages || [])].sort()
    subEdges.push({ a, b, weight: e.weight, labels })
    adj[a][b] = e.weight
    adj[b][a] = e.weight
  }
  return { nodes, adj, edges: subEdges }
}

// rankByDegree ranks cards by weighted degree (sum of incident edge weights)
// then plain degree (neighbor count), descending, name-ascending on ties.
export function rankByDegree(g) {
  const items = g.nodes.map((n) => {
    let wd = 0
    for (const nb in g.adj[n]) wd += g.adj[n][nb]
    return { card: n, weightedDegree: wd, degree: Object.keys(g.adj[n]).length }
  })
  items.sort(
    (x, y) =>
      y.weightedDegree - x.weightedDegree ||
      y.degree - x.degree ||
      (x.card < y.card ? -1 : x.card > y.card ? 1 : 0)
  )
  return items
}

// dominantLabel returns the rule label carrying the most edge weight internal
// to the community (ties by label name), or "" when it has no labeled internal
// edge. It names a community in rule terms.
export function dominantLabel(g, community) {
  const inC = new Set(community)
  const weight = {}
  for (const e of g.edges) {
    if (!inC.has(e.a) || !inC.has(e.b)) continue
    for (const l of e.labels) weight[l] = (weight[l] || 0) + e.weight
  }
  let best = ""
  let bestW = 0
  for (const l in weight) {
    const w = weight[l]
    if (w > bestW || (w === bestW && (best === "" || l < best))) {
      best = l
      bestW = w
    }
  }
  return best
}

export { neutralColor }
