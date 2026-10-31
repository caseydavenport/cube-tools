import { test } from "node:test"
import assert from "node:assert/strict"
import { chartSeries, colorCell, headerLine, packageSubtitle } from "./packagePageModel.js"

const wires = [
  { sources: [{ name: "Graveyard" }], targets: [{ name: "Delirium payoffs" }, { name: "Reanimate targets" }] },
  { sources: [{ name: "Graveyard" }], targets: [{ name: "Flashback" }] },
]

test("the subtitle counts distinct groups and the package's cards", () => {
  assert.equal(packageSubtitle({ wires, stat: { cardCount: 61 } }), "4 groups · 61 cards")
  assert.equal(packageSubtitle({ wires: [{ sources: [{ name: "A" }], targets: [] }], stat: { cardCount: 1 } }), "1 group · 1 card")
})

test("the header line reads the package's numbers in words", () => {
  const page = { stat: { package: 43, record: { bayesian_win_percent: 51.4 } }, map: { typical_pairs: 12 } }
  assert.deepEqual(headerLine(page, true).map(item => [item.key, item.text]), [
    ["built", "43 decks built it"],
    ["pairs", "12 linked pairs in a typical build"],
    ["win", "51% win rate"],
  ])
  assert.deepEqual(headerLine(page, false).map(item => item.key), ["built", "pairs"])
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
