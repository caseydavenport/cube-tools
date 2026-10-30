import { test } from "node:test"
import assert from "node:assert/strict"
import { shownColorSort } from "./colorSort.js"

const COLUMNS = [{ id: "color" }, { id: "bayes_win", needs: ["results"] }, { id: "build" }]

test("without results, a hidden sort column falls back to Build %", () => {
  assert.equal(shownColorSort("bayes_win", COLUMNS, { results: false }), "build")
})

test("a visible sort column stays", () => {
  assert.equal(shownColorSort("bayes_win", COLUMNS, { results: true }), "bayes_win")
  assert.equal(shownColorSort("build", COLUMNS, { results: true }), "build")
})

test("a removed sort column falls back to Bayes win % when it shows", () => {
  assert.equal(shownColorSort("win", COLUMNS, { results: true }), "bayes_win")
  assert.equal(shownColorSort("delta", COLUMNS, { results: true }), "bayes_win")
})

test("a mono-only sort column falls back outside Mono", () => {
  const columns = [{ id: "picks", monoOnly: true }, { id: "build" }]
  assert.equal(shownColorSort("picks", columns, {}, "Dual"), "build")
  assert.equal(shownColorSort("picks", columns, {}, "Mono"), "picks")
})
