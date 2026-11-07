// Pure helpers for the Card explorer, kept free of React so node tests can
// load them: the URL's settings, the chip and tip text, and sort values.

import { entryLabel } from "../design/rules/boardModel.js"

// DEFAULT_THIN is the New connections cutoff when the URL doesn't set one.
export const DEFAULT_THIN = 10

// DEFAULT_SORT is the tables' order when the URL doesn't set one.
export const DEFAULT_SORT = { key: "fills", dir: "desc" }

// readParams reads the explorer's settings from the URL: the search, the
// maybeboard and show-all switches, the thin-role cutoff, and the sort.
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
    sort: { key: params.get("sort") || DEFAULT_SORT.key, dir: params.get("dir") || DEFAULT_SORT.dir },
  }
}

// writeParams returns params with patch applied. Defaults (a blank search,
// switches off, the default cutoff and sort) are left out of the URL; other
// params are kept. The search is trimmed.
export function writeParams(params, patch) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(patch)) {
    if (key === "sort") {
      writeSort(next, value)
      continue
    }
    let text = ""
    if (key === "q") {
      text = value.trim()
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

// writeSort puts a sort in the URL as sort and dir, leaving out the default.
function writeSort(params, sort) {
  if (sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir) {
    params.delete("sort")
    params.delete("dir")
    return
  }
  params.set("sort", sort.key)
  params.set("dir", sort.dir)
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

// typeText is the card's type line, with power and toughness after it for a
// creature.
export function typeText(card) {
  if (card.power === "" && card.toughness === "") {
    return card.type_line
  }
  return `${card.type_line} · ${card.power}/${card.toughness}`
}

// linkedCount is how many things a card would pair with: its linked cube
// cards, plus basic lands as one more when a wire wants them.
export function linkedCount(card) {
  if (card.linked_basics) {
    return card.linked.length + 1
  }
  return card.linked.length
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
