// Pure helpers for the Card explorer, kept free of React so node tests can
// load them: the URL's settings, the chip and tip text, and sort values.

import { entryLabel } from "../design/rules/boardModel.js"

// DEFAULT_THIN is the New connections cutoff when the URL doesn't set one.
export const DEFAULT_THIN = 10

// readParams reads the explorer's settings from the URL: the search, the
// maybeboard and show-all switches, and the thin-role cutoff.
export function readParams(params) {
  let thin = parseInt(params.get("thin") || "", 10)
  if (Number.isNaN(thin)) {
    thin = DEFAULT_THIN
  }
  return {
    q: params.get("q") || "",
    maybe: params.get("maybe") === "1",
    thin,
    all: params.get("all") === "1",
  }
}

// writeParams returns params with patch applied. Defaults (an empty search,
// switches off, the default cutoff) are left out of the URL; other params are
// kept.
export function writeParams(params, patch) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(patch)) {
    let text = ""
    if (key === "q") {
      text = value
    } else if (key === "thin") {
      if (value !== DEFAULT_THIN) {
        text = String(value)
      }
    } else if (value) {
      text = "1"
    }
    if (text) {
      next.set(key, text)
    } else {
      next.delete(key)
    }
  }
  return next
}

// plural is "1 payoff" or "12 payoffs".
function plural(count, one) {
  if (count === 1) {
    return `${count} ${one}`
  }
  return `${count} ${one}s`
}

// joinText is a join's chip: the package, the card's role on the wire, and
// how many cube cards already hold that role there.
export function joinText(join) {
  let others = `${join.others} others`
  if (join.others === 1) {
    others = "1 other"
  }
  return `${join.package} · ${join.role} (${others})`
}

// partnerText is a join's tip: what the card would pair with on the wire's
// other side, counted and named.
export function partnerText(join) {
  const names = join.partner.map(entryLabel).join(", ")
  let lead = `pairs with ${plural(join.partner_cards, "card")}`
  if (join.role === "payoff") {
    lead = `with ${plural(join.partner_cards, "enabler")}`
  } else if (join.role === "enabler") {
    lead = `with ${plural(join.partner_cards, "payoff")}`
  }
  if (join.partner_basics && join.partner_cards === 0) {
    if (join.role === "pairs") {
      lead = "pairs with basic lands"
    } else {
      lead = "with basic lands"
    }
  } else if (join.partner_basics) {
    lead += " and basic lands"
  }
  return `${lead}: ${names}`
}

// joinOpacity fades a join's chip as its role gets crowded: 1 with no other
// cards, falling toward 0.35.
export function joinOpacity(others) {
  return 0.35 + 0.65 / (1 + others / 4)
}

// connectionLine is one New connections entry: the two packages and how many
// other cube cards they share.
export function connectionLine(connection) {
  const pair = `${connection.a} and ${connection.b}`
  if (connection.shared === 0) {
    return `${pair} share no other cards`
  }
  return `${pair} share ${plural(connection.shared, "other card")}`
}

// packageCount is how many distinct packages a card joins.
function packageCount(card) {
  return new Set(card.joins.map(j => j.package)).size
}

// sortValue is the value a column sorts a card by.
export function sortValue(key, card) {
  if (key === "fills") {
    return card.fills_gaps
  }
  if (key === "groups") {
    return card.groups.length
  }
  if (key === "packages") {
    return packageCount(card)
  }
  if (key === "linked") {
    return card.linked.length
  }
  if (key === "connections") {
    return card.connections.length
  }
  if (key === "mv") {
    return card.cmc
  }
  return card.name.toLowerCase()
}

// splitJoins separates a card's joins into thin ones, with at most thin other
// cards in their role, sorted thinnest first, and the crowded rest.
export function splitJoins(joins, thin) {
  const sorted = [...joins].sort((a, b) => a.others - b.others)
  return {
    thin: sorted.filter(j => j.others <= thin),
    crowded: sorted.filter(j => j.others > thin),
  }
}
