import { test } from "node:test"
import assert from "node:assert/strict"
import { cardSortValue, chartSeries, colorBlocks, colorCell, groupPanelState, headerLine, packageProblems, packageSubtitle, rolesText } from "./packagePageModel.js"

const wires = [
  { sources: [{ name: "Graveyard" }], targets: [{ name: "Delirium payoffs" }, { name: "Reanimate targets" }] },
  { sources: [{ name: "Graveyard" }], targets: [{ name: "Flashback" }] },
]

test("the subtitle counts distinct groups and the package's cards", () => {
  assert.equal(packageSubtitle({ wires, stat: { cardCount: 61 } }), "4 groups · 61 cards")
  assert.equal(packageSubtitle({ wires: [{ sources: [{ name: "A" }], targets: [] }], stat: { cardCount: 1 } }), "1 group · 1 card")
})

test("the header line reads the package's numbers in words", () => {
  const page = { stat: { package: 43, record: { wins: 60, losses: 57, draws: 0, bayesian_win_percent: 51.4 } }, map: { typical_pairs: 12 } }
  assert.deepEqual(headerLine(page, true).map(item => [item.key, item.text]), [
    ["built", "43 decks built it"],
    ["pairs", "12 linked pairs in a typical build"],
    ["win", "51% win rate"],
  ])
  assert.deepEqual(headerLine(page, false).map(item => item.key), ["built", "pairs"])
})

test("the header leaves out the win rate when the builders played no games", () => {
  const page = { stat: { package: 0, record: { wins: 0, losses: 0, draws: 0, bayesian_win_percent: 0 } }, map: { typical_pairs: 0 } }
  assert.deepEqual(headerLine(page, true).map(item => item.key), ["built", "pairs"])
})

test("the problems name missing groups and wires with an empty side", () => {
  const map = {
    groups: [{ name: "Payoffs" }, { name: "Ghosts", missing: true }, { name: "card:Black Lotus", card_entry: true, missing: true }],
    wires: [
      { sources: ["Payoffs"], targets: ["Ghosts"] },
      { sources: ["Payoffs"], targets: [] },
    ],
  }
  assert.deepEqual(packageProblems(map), [
    "No group named Ghosts",
    "Black Lotus isn't in the cube",
    "Wire 2 has no groups on one side",
  ])
  assert.deepEqual(packageProblems({ groups: [{ name: "Payoffs" }], wires: [{ sources: ["Payoffs"], targets: ["Payoffs"] }] }), [])
})

test("one deck reads in the singular", () => {
  const page = { stat: { package: 1, record: { bayesian_win_percent: 50 } }, map: { typical_pairs: 4 } }
  assert.equal(headerLine(page, false)[0].text, "1 deck built it")
})

test("a color cell is thin only when the server says so", () => {
  const row = { counts: { W: 0, B: 1, R: 5 }, thin: ["B"] }
  assert.deepEqual(colorCell(row, "B"), { value: 1, thin: true })
  assert.deepEqual(colorCell(row, "W"), { value: 0, thin: false })
  assert.deepEqual(colorCell(row, "R"), { value: 5, thin: false })
})

test("the chart keeps every draft and gives each draft's raw rate", () => {
  const overTime = [
    { draft_id: 1, date: "2024-01-01", built: 1, decks: 4, smoothed: 25, in_range: false },
    { draft_id: 2, date: "2024-02-01", built: 0, decks: 0, smoothed: 25, in_range: true },
    { draft_id: 3, date: "2024-03-01", built: 3, decks: 6, smoothed: 40, in_range: true },
  ]
  assert.deepEqual(chartSeries(overTime), {
    labels: ["2024-01-01", "2024-02-01", "2024-03-01"],
    smoothed: [25, 25, 40],
    raw: [25, null, 50],
    inRange: [false, true, true],
  })
})

test("the group panel says when the package has no such entry instead of loading forever", () => {
  const groups = [{ name: "Payoffs" }]
  assert.deepEqual(groupPanelState({ groups: null, failed: false }, "Payoffs"), { kind: "loading" })
  assert.deepEqual(groupPanelState({ groups: [], failed: true }, "Payoffs"), { kind: "failed" })
  assert.deepEqual(groupPanelState({ groups, failed: false }, "Payoffs"), { kind: "members", members: groups[0] })
  assert.deepEqual(groupPanelState({ groups, failed: false }, "Fodder"), { kind: "missing" })
})

test("color blocks split rows into enablers then payoffs, each ending with its total", () => {
  const rows = [
    { group: "Sacs creatures", side: "source" },
    { group: "Dies triggers", side: "target" },
    { group: "Sacs lands", side: "source" },
    { group: "All of one side", side: "source", total: true },
    { group: "All of the other side", side: "target", total: true },
  ]
  const blocks = colorBlocks(rows, true)
  assert.deepEqual(blocks.map(b => b.title), ["Enablers", "Payoffs"])
  assert.deepEqual(blocks[0].rows.map(r => r.name), ["Sacs creatures", "Sacs lands", "All enablers"])
  assert.deepEqual(blocks[1].rows.map(r => r.name), ["Dies triggers", "All payoffs"])
  assert.equal(blocks[0].rows[2].row, rows[3])
})

test("color blocks use the Pairs with names when a wire doesn't enable", () => {
  const rows = [
    { group: "Wraths", side: "source" },
    { group: "Big creatures", side: "target" },
    { group: "x", side: "source", total: true },
    { group: "y", side: "target", total: true },
  ]
  const blocks = colorBlocks(rows, false)
  assert.deepEqual(blocks.map(b => b.title), ["Cards", "Pair with"])
  assert.deepEqual(blocks[0].rows.map(r => r.name), ["Wraths", "All cards"])
  assert.deepEqual(blocks[1].rows.map(r => r.name), ["Big creatures", "All they pair with"])
})

test("a card's roles read as words in a fixed order", () => {
  assert.equal(rolesText(["payoff", "enabler"]), "Enabler, Payoff")
  assert.equal(rolesText(["pairs"]), "Pairs with")
})

test("card rows sort by name, mana value or deck counts", () => {
  const row = { name: "Mayhem Devil", cmc: 3, roles: ["payoff"], played: 9, builds: 4 }
  assert.equal(cardSortValue("name", row), "mayhem devil")
  assert.equal(cardSortValue("cmc", row), 3)
  assert.equal(cardSortValue("role", row), "payoff")
  assert.equal(cardSortValue("played", row), 9)
  assert.equal(cardSortValue("builds", row), 4)
})
