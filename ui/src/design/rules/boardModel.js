// Pure helpers for the Rules editor's package board, kept free of React so
// node tests can load them. They read the /stats/rules-board response: each
// package's wires, groups, build stats and color counts.

import { cardRefName } from "../../utils/DesignRules.js"

// COLOR_ORDER is the color bar's order: the five colors, colorless nonland
// cards, then lands.
const COLOR_ORDER = ["W", "U", "B", "R", "G", "C", "L"]

// SHARES_SHOWN is how many sharing packages a badge names before "+N".
const SHARES_SHOWN = 2

// entryLabel is how a wire entry reads: the card for a card entry, else the
// group's name.
export function entryLabel(name) {
  return cardRefName(name) || name
}

// sideText lists one wire side's entries, each group with its card count.
function sideText(entries, groups) {
  const parts = []
  for (const entry of entries) {
    if (cardRefName(entry)) {
      parts.push(cardRefName(entry))
      continue
    }
    const group = groups.find(g => g.name === entry)
    let count = 0
    if (group) {
      count = group.cards.length
    }
    parts.push(`${entry} (${count})`)
  }
  return parts.join(", ")
}

// wiringSummary is a package's one-line wiring: both sides of a single wire,
// or how many wires and groups a bigger package has.
export function wiringSummary(pkg) {
  if (pkg.wires.length === 1) {
    const wire = pkg.wires[0]
    return `${sideText(wire.sources, pkg.groups)} ↔ ${sideText(wire.targets, pkg.groups)}`
  }
  return `${pkg.wires.length} wires · ${pkg.groups.length} groups`
}

// isShown reports whether the cube shows the package outside the editor:
// forced on or off decides, and otherwise the relevance line does.
export function isShown(pkg) {
  if (pkg.forced === "on") {
    return true
  }
  if (pkg.forced === "off") {
    return false
  }
  return pkg.relevant
}

// lineBadge notes a package the cube forces, or one below the relevance line
// for this cube's list, or returns null.
function lineBadge(pkg) {
  if (pkg.forced === "on") {
    return { kind: "info", text: "Always shown" }
  }
  if (pkg.forced === "off") {
    return { kind: "warn", text: "Always hidden" }
  }
  if (!pkg.relevant) {
    return { kind: "warn", text: "Below the line in this cube" }
  }
  return null
}

// badges are the small notes on a package's board card: problem (a broken
// wire, or null), where it stands against the relevance line, one-card
// groups, rarely coming together, then the packages it shares groups with.
export function badges(pkg, problem) {
  const out = []
  if (problem) {
    out.push({ kind: "bad", text: problem })
  }
  const line = lineBadge(pkg)
  if (line) {
    out.push(line)
  }
  const oneCard = pkg.one_card_groups.length
  if (oneCard === 1) {
    out.push({ kind: "warn", text: "1-card group" })
  } else if (oneCard > 1) {
    out.push({ kind: "warn", text: `${oneCard} one-card groups` })
  }
  if (pkg.stat.rarelyTogether) {
    out.push({ kind: "warn", text: "Rarely comes together" })
  }
  const shares = pkg.shares_with
  if (shares.length > 0) {
    let text = "Shares groups with " + shares.slice(0, SHARES_SHOWN).join(", ")
    if (shares.length > SHARES_SHOWN) {
      text += ` +${shares.length - SHARES_SHOWN}`
    }
    out.push({ kind: "info", text })
  }
  return out
}

// sortPackages returns the packages sorted A-Z ("az") or most built first
// ("built", ties by name), leaving the input as it was.
export function sortPackages(packages, sort) {
  const out = [...packages]
  if (sort === "built") {
    out.sort((a, b) => b.stat.buildRate - a.stat.buildRate || a.name.localeCompare(b.name))
  } else {
    out.sort((a, b) => a.name.localeCompare(b.name))
  }
  return out
}

// cardHits lists the cards in the package's groups whose names contain q,
// with the group each sits in.
function cardHits(pkg, q) {
  const hits = []
  for (const group of pkg.groups) {
    for (const card of group.cards) {
      if (card.toLowerCase().includes(q)) {
        hits.push({ card, group: entryLabel(group.name) })
      }
    }
  }
  return hits
}

// packageMatches reports whether q is in the package's name or a group's.
function packageMatches(pkg, q) {
  if (pkg.name.toLowerCase().includes(q)) {
    return true
  }
  return pkg.groups.some(g => entryLabel(g.name).toLowerCase().includes(q))
}

// filterBoard keeps the packages and unused groups whose name, group names
// or cards contain q, ignoring case. Each kept package carries its position
// on the board, for its color, and the cards that matched.
export function filterBoard(board, q) {
  const query = q.trim().toLowerCase()
  const packages = []
  board.packages.forEach((pkg, index) => {
    if (!query) {
      packages.push({ pkg, index, hits: [] })
      return
    }
    const hits = cardHits(pkg, query)
    if (hits.length > 0 || packageMatches(pkg, query)) {
      packages.push({ pkg, index, hits })
    }
  })

  const unused = board.unused_groups.filter(g => {
    if (!query) {
      return true
    }
    return g.name.toLowerCase().includes(query) || g.cards.some(c => c.toLowerCase().includes(query))
  })
  return { packages, unused }
}

// linkPair reads a search like "Goblin Bombardment × Mayhem Devil", or with
// " x ", as two cards to check a link between. Both must be in cardNames;
// the answer uses their exact spelling, or is null.
export function linkPair(q, cardNames) {
  const parts = q.split(/\s+[×xX]\s+/)
  if (parts.length !== 2) {
    return null
  }
  const byLower = new Map(cardNames.map(name => [name.toLowerCase(), name]))
  const a = byLower.get(parts[0].trim().toLowerCase())
  const b = byLower.get(parts[1].trim().toLowerCase())
  if (!a || !b) {
    return null
  }
  return { a, b }
}

// colorShares turns a package's color counts into the color bar's segments,
// in table order, leaving out empty columns.
export function colorShares(colors) {
  let total = 0
  for (const key of COLOR_ORDER) {
    total += colors[key] || 0
  }
  if (total === 0) {
    return []
  }
  const out = []
  for (const key of COLOR_ORDER) {
    const count = colors[key] || 0
    if (count > 0) {
      out.push({ key, pct: Math.round(100 * count / total) })
    }
  }
  return out
}

// cardsText reads a card count, like "1 card" or "20 cards".
export function cardsText(count) {
  if (count === 1) {
    return "1 card"
  }
  return `${count} cards`
}

// dotKeys are a member card's color dots: a land gets "L", a colorless
// spell "C", anything else one dot per color.
export function dotKeys(card) {
  if (card.land) {
    return ["L"]
  }
  if (card.colors.length === 0) {
    return ["C"]
  }
  return card.colors
}
