import { test } from "node:test"
import assert from "node:assert/strict"
import { statsUrl } from "./statsUrls.js"

test("builds the stats URL with params in order", () => {
  assert.equal(statsUrl("polyverse", "health", { bucket_size: 3, sliding: true }), "/api/polyverse/stats/health?bucket_size=3&sliding=true")
})

test("encodes the deck filter", () => {
  assert.equal(statsUrl("polyverse", "cards", { match: 'player:"Joan Jett"' }), "/api/polyverse/stats/cards?match=player%3A%22Joan+Jett%22")
})

test("leaves out undefined params", () => {
  assert.equal(statsUrl("polyverse", "cards", { a: 1, b: undefined }), "/api/polyverse/stats/cards?a=1")
})

test("keeps a cube id with a colon", () => {
  assert.ok(statsUrl("cc:polyversal", "cards", {}).startsWith("/api/cc:polyversal/stats/cards?"))
})
