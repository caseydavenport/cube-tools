import { test } from "node:test"
import assert from "node:assert/strict"
import { addToComparison, comparisonMap, formatCompare, parseCompare, toggleRef } from "./Compare.js"

const ref = (d) => `${d.metadata.draft_id}/${d.id}`
const deck = (draft, id) => ({ id, metadata: { draft_id: draft } })

test("compare param round-trips deck refs", () => {
  assert.deepEqual(parseCompare("12/3,14/5"), ["12/3", "14/5"])
  assert.deepEqual(parseCompare(""), [])
  assert.deepEqual(parseCompare(null), [])
  assert.equal(formatCompare(["12/3", "14/5"]), "12/3,14/5")
})

test("a single deck is not a comparison, so the param is dropped", () => {
  assert.equal(formatCompare(["12/3"]), "")
  assert.equal(formatCompare([]), "")
})

test("toggleRef adds a missing deck and removes a present one", () => {
  assert.deepEqual(toggleRef(["12/3"], "14/5"), ["12/3", "14/5"])
  assert.deepEqual(toggleRef(["12/3", "14/5"], "12/3"), ["14/5"])
})

test("comparisonMap resolves refs to loaded decks, then adds the highlighted deck", () => {
  const decks = [deck(12, 3), deck(14, 5), deck(14, 10)]
  const got = comparisonMap(["14/10", "99/1"], "12/3", decks, ref)
  assert.deepEqual([...got.keys()], ["14/10", "12/3"])
  assert.equal(got.get("12/3"), decks[0])

  const same = comparisonMap(["12/3", "14/5"], "12/3", decks, ref)
  assert.deepEqual([...same.keys()], ["12/3", "14/5"])
  assert.equal(comparisonMap([], "", decks, ref).size, 0)
})

test("ctrl-clicking a second deck compares it with the highlighted one", () => {
  assert.deepEqual(addToComparison([], "12/3", "14/5"), { refs: ["12/3", "14/5"], highlighted: "14/5" })
  assert.deepEqual(addToComparison(["12/3", "14/5"], "14/5", "14/10"), { refs: ["12/3", "14/5", "14/10"], highlighted: "14/10" })
})

test("ctrl-clicking a compared deck drops it and highlights another", () => {
  assert.deepEqual(addToComparison(["12/3", "14/5"], "14/5", "14/5"), { refs: ["12/3"], highlighted: "12/3" })
  assert.deepEqual(addToComparison(["12/3", "14/5"], "14/5", "12/3"), { refs: ["14/5"], highlighted: "14/5" })
})

test("ctrl-clicking with nothing highlighted just highlights the deck", () => {
  assert.deepEqual(addToComparison([], "", "12/3"), { refs: ["12/3"], highlighted: "12/3" })
})
