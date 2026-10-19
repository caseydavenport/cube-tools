import { test } from "node:test"
import assert from "node:assert/strict"
import { pageSegment, pageHref, switchCubeInPath } from "./paths.js"

test("the page segment is the part after the cube id", () => {
  assert.equal(pageSegment("/polyverse/cards"), "cards")
  assert.equal(pageSegment("/polyverse/import/photos"), "import")
})

test("a cube's home has an empty page segment", () => {
  assert.equal(pageSegment("/polyverse"), "")
  assert.equal(pageSegment("/"), "")
})

test("page links point at the cube home for an empty path", () => {
  assert.equal(pageHref("cc:joan", ""), "/cc:joan")
  assert.equal(pageHref("cc:joan", "decks"), "/cc:joan/decks")
})

test("switching cubes keeps the rest of the path", () => {
  assert.equal(switchCubeInPath("/polyverse/cards", "aurora"), "/aurora/cards")
  assert.equal(switchCubeInPath("/polyverse/import/photos", "aurora"), "/aurora/import/photos")
  assert.equal(switchCubeInPath("/", "aurora"), "/aurora")
})
