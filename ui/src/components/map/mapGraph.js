// The graph behind every map: built from a page's nodes and edges, laid out
// with ForceAtlas2 (a force layout that pulls linked nodes together), and split
// into communities with Louvain. Seeded, so a map looks the same on every load.

import { UndirectedGraph } from "graphology"
import forceAtlas2 from "graphology-layout-forceatlas2"
import louvain from "graphology-communities-louvain"

// LAYOUT_SEED is the default seed for layouts and communities. Any fixed
// number works; changing it reshuffles every map once.
const LAYOUT_SEED = 7

// buildMapGraph turns a page's nodes ({ id, label, radius, color, ... }) and
// edges ({ source, target, weight, color }) into a graph. Edges to nodes that
// aren't in the list are dropped, and a pair listed twice becomes one edge
// carrying both weights.
export function buildMapGraph(nodes, edges) {
  const graph = new UndirectedGraph()
  for (const node of nodes) {
    graph.mergeNode(node.id, { ...node, size: node.radius })
  }

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue
    }
    const weight = edge.weight || 1
    if (graph.hasEdge(edge.source, edge.target)) {
      const existing = graph.edge(edge.source, edge.target)
      graph.updateEdgeAttribute(existing, "weight", total => total + weight)
      continue
    }
    graph.addEdge(edge.source, edge.target, { weight, color: edge.color })
  }
  return graph
}

// layoutMap places every node: a seeded random start, then ForceAtlas2. Strong
// gravity keeps unlinked nodes near the cluster, and heavier edges pull harder.
// The settings come from the 2026-10-29 map spike.
export function layoutMap(graph, seed = LAYOUT_SEED) {
  const random = seededRandom(seed)
  graph.forEachNode(id => {
    graph.mergeNodeAttributes(id, { x: random(), y: random() })
  })

  forceAtlas2.assign(graph, {
    iterations: 1500,
    getEdgeWeight: "weight",
    settings: {
      ...forceAtlas2.inferSettings(graph),
      linLogMode: false,
      adjustSizes: false,
      barnesHutOptimize: false,
      strongGravityMode: true,
      scalingRatio: 4,
      gravity: 3,
      edgeWeightInfluence: 1.5,
    },
  })
}

// findCommunities splits the graph into communities, groups of nodes linked
// more to each other than to the rest, using Louvain. It returns each node's
// community number. Heavier edges count for more.
export function findCommunities(graph, seed = LAYOUT_SEED) {
  return louvain(graph, { getEdgeWeight: "weight", rng: seededRandom(seed) })
}

// groupCommunities turns findCommunities' numbers into lists of node ids, one
// per community, largest first. Ties go to the list with the alphabetically
// first member, and each list is in name order.
export function groupCommunities(communityOf) {
  const byNumber = new Map()
  for (const [id, number] of Object.entries(communityOf)) {
    if (!byNumber.has(number)) {
      byNumber.set(number, [])
    }
    byNumber.get(number).push(id)
  }

  const groups = [...byNumber.values()]
  for (const members of groups) {
    members.sort()
  }
  groups.sort((a, b) => {
    if (a.length !== b.length) {
      return b.length - a.length
    }
    return a[0] < b[0] ? -1 : 1
  })
  return groups
}

// seededRandom returns a random number generator that gives the same sequence
// for the same seed (the mulberry32 algorithm). Numbers are in [0, 1).
export function seededRandom(seed) {
  let state = seed
  return function () {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
