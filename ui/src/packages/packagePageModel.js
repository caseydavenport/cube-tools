// Pure helpers for the package page, kept free of React so node tests can
// load them: the header's text, color cells, and the chart's data.

import { winRateValue } from "../components/kit/winRate.js"
import { entryLabel } from "../design/rules/boardModel.js"

// plural is "1 group" or "4 groups".
function plural(count, one, many) {
  if (count === 1) {
    return `1 ${one}`
  }
  return `${count} ${many}`
}

// packageSubtitle is the header's line under the name: how many distinct
// groups the package's wires use, and how many cube cards they hold.
export function packageSubtitle(page) {
  const groups = new Set()
  for (const wire of page.wires) {
    for (const group of [...wire.sources, ...wire.targets]) {
      groups.add(group.name)
    }
  }
  return `${plural(groups.size, "group", "groups")} · ${plural(page.stat.cardCount, "card", "cards")}`
}

// headerLine is the header's line of numbers in words, each with a tip that
// gives the exact rule: decks that built it, linked pairs in a typical build,
// and, when showWinRate and those decks played games, how they did.
export function headerLine(page, showWinRate) {
  const items = [
    {
      key: "built",
      text: `${plural(page.stat.package, "deck", "decks")} built it`,
      tip: "Decks with 2+ cards from each side of one wire, and 3+ of its cards.",
    },
    {
      key: "pairs",
      text: `${page.map.typical_pairs} linked pairs in a typical build`,
      tip: "In each deck, the cards on each side of a wire multiplied together, added up over the wires. The middle value over decks that built it.",
    },
  ]
  const winRate = winRateValue(page.stat.record)
  if (showWinRate && winRate !== null) {
    items.push({
      key: "win",
      text: `${Math.round(winRate)}% win rate`,
      tip: "How the decks that built it did, Bayes-adjusted.",
    })
  }
  return items
}

// packageProblems lists what's broken in the package's rules, for the
// header's red badge: entries that match nothing the cube has, then wires
// with no groups on one side. It's empty for a healthy package.
export function packageProblems(map) {
  const problems = []
  for (const group of map.groups) {
    if (!group.missing) {
      continue
    }
    if (group.card_entry) {
      problems.push(`${entryLabel(group.name)} isn't in the cube`)
    } else {
      problems.push(`No group named ${group.name}`)
    }
  }
  map.wires.forEach((wire, i) => {
    if ((wire.sources || []).length === 0 || (wire.targets || []).length === 0) {
      problems.push(`Wire ${i + 1} has no groups on one side`)
    }
  })
  return problems
}

// groupPanelState says what the group panel shows for the entry called name,
// from useRuleGroups' answer: "loading", "failed", "missing" when the package
// has no such entry (say, just after a rename), or "members" with them.
export function groupPanelState(answer, name) {
  if (answer.failed) {
    return { kind: "failed" }
  }
  if (!answer.groups) {
    return { kind: "loading" }
  }
  const members = answer.groups.find(g => g.name === name)
  if (!members) {
    return { kind: "missing" }
  }
  return { kind: "members", members }
}

// colorRowLabel names a support-by-color row. When every wire in the package
// enables (enables true), sides read as enablers and payoffs; otherwise a
// group row has no role and the totals read "All cards" and "All they pair
// with", the package dialog's names for a Pairs with wire's sides.
export function colorRowLabel(row, enables) {
  const first = row.side === "source"
  if (row.total) {
    if (enables) {
      return { name: first ? "All enablers" : "All payoffs", role: "" }
    }
    return { name: first ? "All cards" : "All they pair with", role: "" }
  }
  if (enables) {
    return { name: row.group, role: first ? "enabler" : "payoff" }
  }
  return { name: row.group, role: "" }
}

// colorCell is one cell of the support-by-color table: the group's card count
// in the column, and whether the server marked it thin.
export function colorCell(row, color) {
  return { value: row.counts[color] || 0, thin: row.thin.includes(color) }
}

// chartSeries turns the builds per draft into the chart's lines: the smoothed
// rate, each draft's own rate (null for a draft with no decks), and which
// drafts are in the date range.
export function chartSeries(overTime) {
  return {
    labels: overTime.map(d => d.date),
    smoothed: overTime.map(d => d.smoothed),
    raw: overTime.map(d => {
      if (d.decks === 0) {
        return null
      }
      return Math.round(1000 * d.built / d.decks) / 10
    }),
    inRange: overTime.map(d => d.in_range),
  }
}
