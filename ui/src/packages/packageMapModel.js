// Pure helpers for the package page's map, kept free of React so node tests
// can load them. They read the "map" block of /stats/package: each group
// once, and each wire with its two sides and how many decks filled it.

// DEPTH_CAP is the last row and column of a depth grid, meaning "5 or more".
const DEPTH_CAP = 5

// sideCounts counts how often each group sits on each side of a wire, and
// the side of the first wire that names it.
function sideCounts(wires) {
  const counts = {}
  wires.forEach((wire, index) => {
    for (const [side, names] of [["left", wire.sources || []], ["right", wire.targets || []]]) {
      for (const name of names) {
        if (!counts[name]) {
          counts[name] = { left: 0, right: 0, first: side, firstWire: index }
        }
        counts[name][side]++
      }
    }
  })
  return counts
}

// sideOf is the side a group goes on: the side it holds in most wires, or
// the side of its first wire on a tie.
function sideOf(count) {
  if (count.left > count.right) {
    return "left"
  }
  if (count.right > count.left) {
    return "right"
  }
  return count.first
}

// columnHeadings names the map's two columns, Enablers and Payoffs, when
// every wire in the package is an Enables wire. It returns null otherwise,
// since a Pairs with wire's sides have no names.
export function columnHeadings(map) {
  if (map.wires.length === 0) {
    return null
  }
  for (const wire of map.wires) {
    if (wire.kind !== "enables") {
      return null
    }
  }
  return ["Enablers", "Payoffs"]
}

// layoutMap splits the map's groups into the two columns. A group goes on
// the side it holds in most wires; within a column, groups follow the order
// of the first wire that names them, then their names.
export function layoutMap(map) {
  const counts = sideCounts(map.wires)
  const left = []
  const right = []
  for (const group of map.groups) {
    const count = counts[group.name]
    if (!count) {
      continue
    }
    if (sideOf(count) === "left") {
      left.push(group)
    } else {
      right.push(group)
    }
  }
  const byWireThenName = (a, b) => counts[a.name].firstWire - counts[b.name].firstWire || a.name.localeCompare(b.name)
  left.sort(byWireThenName)
  right.sort(byWireThenName)
  return { left, right }
}

// threadWeight is a wire's thread width: thin for a wire one deck or none
// filled, heavier as more decks filled it compared with the busiest wire.
export function threadWeight(decks, maxDecks) {
  if (decks <= 1 || maxDecks <= 0) {
    return 1.2
  }
  return Math.round((1.8 + 2 * decks / maxDecks) * 10) / 10
}

// depthMatrix turns a wire's depth cells into a 6×6 table of deck counts,
// indexed [cards on one side][cards on the other], where 5 means 5 or more.
export function depthMatrix(cells) {
  const matrix = []
  for (let a = 0; a <= DEPTH_CAP; a++) {
    matrix.push(new Array(DEPTH_CAP + 1).fill(0))
  }
  for (const cell of cells) {
    matrix[Math.min(cell.a, DEPTH_CAP)][Math.min(cell.b, DEPTH_CAP)] += cell.count
  }
  return matrix
}

// decksText reads a deck count, like "1 deck" or "24 decks".
export function decksText(count) {
  if (count === 1) {
    return "1 deck"
  }
  return `${count} decks`
}
