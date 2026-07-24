// Deck-subgraph analytics for the Map view, ported from the hack/deckgraph Go
// prototype. Every function is pure and deterministic (sorted nodes, lexical
// tie-breaks) so repeated renders produce identical output.

const NEUTRAL = "#64748b"

// buildDeckSubgraph induces the subgraph on `names` from the cube-wide edge
// list. An edge survives only when both endpoints are in the name set; every
// name becomes a node even with no surviving edges. Each edge is normalized so
// a < b with its rule labels sorted.
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
    const labels = [...(e.rule_labels || [])].sort()
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

// modularity is the weighted modularity Q of a hard partition:
// Q = sum_c [ L_c/m - (D_c/2m)^2 ], m being total edge weight, L_c the weight
// inside community c, D_c the summed weighted degree of c's nodes.
export function modularity(g, partition) {
  const deg = {}
  let twoM = 0
  for (const n of g.nodes) {
    let d = 0
    for (const nb in g.adj[n]) d += g.adj[n][nb]
    deg[n] = d
    twoM += d
  }
  if (twoM === 0) return 0
  const m = twoM / 2
  const comm = {}
  partition.forEach((nodes, ci) => {
    for (const n of nodes) comm[n] = ci
  })
  const dc = {}
  for (const n of g.nodes) dc[comm[n]] = (dc[comm[n]] || 0) + deg[n]
  const lc = {}
  for (const e of g.edges) {
    if (comm[e.a] === comm[e.b]) lc[comm[e.a]] = (lc[comm[e.a]] || 0) + e.weight
  }
  let q = 0
  for (const c in dc) {
    const d = dc[c]
    q += (lc[c] || 0) / m - (d / twoM) * (d / twoM)
  }
  return q
}

// greedyModularityCommunities runs Clauset-Newman-Moore: every node starts in
// its own community, then repeatedly merge the connected pair that most raises
// Q, stopping when no merge helps. It recomputes Q per candidate merge, which
// is fine at deck scale (~40 nodes). Communities come back largest-first.
export function greedyModularityCommunities(g) {
  let parts = g.nodes.map((n) => [n])
  let bestQ = modularity(g, parts)
  if (parts.length <= 1) return { communities: sortPartition(parts), q: bestQ }
  for (;;) {
    let bi = -1
    let bj = -1
    let bestDelta = 1e-12
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (!partsConnected(g, parts[i], parts[j])) continue
        const q = modularity(g, mergeParts(parts, i, j))
        if (q - bestQ > bestDelta) {
          bestDelta = q - bestQ
          bi = i
          bj = j
        }
      }
    }
    if (bi < 0) break
    parts = mergeParts(parts, bi, bj)
    bestQ = modularity(g, parts)
  }
  return { communities: sortPartition(parts), q: bestQ }
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

export { NEUTRAL }

function partsConnected(g, a, b) {
  const inB = new Set(b)
  for (const n of a) {
    for (const nb in g.adj[n]) if (inB.has(nb)) return true
  }
  return false
}

function mergeParts(parts, i, j) {
  const merged = [...parts[i], ...parts[j]]
  const out = [merged]
  for (let k = 0; k < parts.length; k++) {
    if (k !== i && k !== j) out.push(parts[k])
  }
  return out
}

function sortPartition(parts) {
  const out = parts.map((c) => [...c].sort())
  out.sort(
    (a, b) => b.length - a.length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  )
  return out
}
