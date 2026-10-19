import { test } from "node:test"
import assert from "node:assert/strict"
import { addTag, annotationPayload, removeTag, saveErrorText, toggleColor } from "./deckEdits.js"

const DECK = {
  id: 5,
  metadata: { draft_id: 48 },
  macro_archetype: "aggro",
  labels: ["tokens"],
  colors_override: null,
  notes: "Great deck",
}

test("annotationPayload keeps the fields a change leaves out", () => {
  assert.deepEqual(annotationPayload(DECK, { macro: "control" }), {
    draft_id: 48,
    id: 5,
    macro_archetype: "control",
    labels: ["tokens"],
    colors: [],
    notes: undefined,
  })
})

test("annotationPayload sends notes only when they change", () => {
  assert.equal(annotationPayload(DECK, { notes: "New" }).notes, "New")
  assert.equal(annotationPayload(DECK, { labels: [] }).notes, undefined)
})

test("saveErrorText names what failed and why", () => {
  assert.equal(saveErrorText("Archetype", new Error("cube is read-only")), "Archetype couldn't be saved: cube is read-only")
})

test("toggleColor adds and removes a color, keeping WUBRG order", () => {
  assert.deepEqual(toggleColor(["G", "W"], "U"), ["W", "U", "G"])
  assert.deepEqual(toggleColor(["W", "U"], "W"), ["U"])
})

test("addTag trims, skips blanks and duplicates", () => {
  assert.deepEqual(addTag(["tokens"], "  ramp "), ["tokens", "ramp"])
  assert.deepEqual(addTag(["tokens"], "tokens"), ["tokens"])
  assert.deepEqual(addTag(["tokens"], "   "), ["tokens"])
})

test("removeTag drops one tag", () => {
  assert.deepEqual(removeTag(["tokens", "ramp"], "tokens"), ["ramp"])
})
