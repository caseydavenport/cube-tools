import { test } from "node:test"
import assert from "node:assert/strict"
import { shownColorSort } from "./colorSort.js"

const COLUMNS = [{ id: "color" }, { id: "win", needs: ["results"] }, { id: "build" }]

test("a hidden sort column falls back to Build %", () => {
  assert.equal(shownColorSort("win", COLUMNS, { results: false }), "build")
})

test("a visible sort column stays", () => {
  assert.equal(shownColorSort("win", COLUMNS, { results: true }), "win")
})
