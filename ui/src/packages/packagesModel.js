// Pure helpers for the Packages index, kept free of React so node tests can
// load them: which view to show, cell text, sorting, and the map's nodes.

import { winRateValue } from "../components/kit/winRate.js"

// VIEWS are the index's two views, as the URL's ?view= names them.
const VIEWS = ["table", "map"]

// MIN_RADIUS and MAX_RADIUS bound a map node's size.
const MIN_RADIUS = 6
const MAX_RADIUS = 22

// defaultView is the view the index opens on: the table when the cube has
// decks to count, else the map, which needs only the rules.
export function defaultView(hasDecks) {
  if (hasDecks) {
    return "table"
  }
  return "map"
}

// viewFrom reads the view from the URL's query params, falling back to the
// default for a missing or unknown one.
export function viewFrom(params, hasDecks) {
  const view = params.get("view")
  if (VIEWS.includes(view)) {
    return view
  }
  return defaultView(hasDecks)
}

// percent formats a 0-1 share as a whole percent.
function percent(share) {
  return `${Math.round(share * 100)}%`
}

// builtInText is the Built in cell: how many decks built the package and
// that count's share of the decks.
export function builtInText(stat) {
  let decks = `${stat.package} decks`
  if (stat.package === 1) {
    decks = "1 deck"
  }
  return `${decks} · ${percent(stat.buildRate)}`
}

// cameTogetherText is the Came together cell, or a dash when no deck had the
// package's cards, since then there's nothing to divide by.
export function cameTogetherText(stat) {
  if (stat.has3 === 0) {
    return "—"
  }
  return percent(stat.cameTogether)
}

// nodeSize is the number a package's map node is sized by: its builds, or its
// card count when the cube has no decks.
function nodeSize(pkg, hasDecks) {
  if (hasDecks) {
    return pkg.package
  }
  return pkg.cardCount
}

// mapNodes turns the index's packages into map nodes. Radius grows with the
// square root of the node's size, so area tracks it. Nodes outside the largest
// third are quiet: the map shows their label only on hover. color is the
// package's color letter, "" for gray.
export function mapNodes(packages, hasDecks) {
  const sizes = packages.map(p => nodeSize(p, hasDecks))
  const largest = Math.max(1, ...sizes)
  const labelCount = Math.max(1, Math.round(packages.length / 3))
  const labeled = new Set(rankedNames(packages, sizes, labelCount))

  return packages.map((p, i) => {
    return {
      id: p.name,
      label: p.name,
      quiet: !labeled.has(p.name),
      radius: MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(sizes[i] / largest),
      color: p.color,
    }
  })
}

// rankedNames returns the names of the count largest packages by size, ties
// broken by name.
function rankedNames(packages, sizes, count) {
  const ranked = packages.map((p, i) => ({ name: p.name, size: sizes[i] }))
  ranked.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
  return ranked.slice(0, count).map(r => r.name)
}

// sharedGroupsOf lists the packages that share groups with name, each with
// the shared groups, in the order the edges list them.
export function sharedGroupsOf(name, edges) {
  const out = []
  for (const edge of edges) {
    if (edge.source === name) {
      out.push({ name: edge.target, groups: edge.groups })
    } else if (edge.target === name) {
      out.push({ name: edge.source, groups: edge.groups })
    }
  }
  return out
}

// sortValue is the number, or lowercase name, a table column sorts a package
// by. A package whose builders played no games sorts below every rate.
export function sortValue(key, stat) {
  if (key === "name") {
    return stat.name.toLowerCase()
  }
  if (key === "built") {
    return stat.package
  }
  if (key === "had") {
    return stat.has3
  }
  if (key === "together") {
    return stat.cameTogether
  }
  const rate = winRateValue(stat.record)
  if (rate === null) {
    return -1
  }
  return rate
}

// edgeList turns the index's package edges into map edges, weighted by how
// many groups the two packages share.
export function edgeList(edges) {
  return edges.map(e => ({ source: e.source, target: e.target, weight: e.groups.length }))
}
