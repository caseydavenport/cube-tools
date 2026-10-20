import { test } from "node:test"
import assert from "node:assert/strict"
import { compareSnapshots, percentChanged, ROUTES, routeHash, shotName } from "./text-snapshot.mjs"

// snapshotWith builds a one-route snapshot holding the given lines.
function snapshotWith(lines) {
  return { shots: null, routes: { cards: { lines, attrs: ["title=Played by"] } } }
}

test("identical snapshots compare clean", () => {
  const s = snapshotWith(["Cards", "# Games", "Win%"])
  assert.deepEqual(compareSnapshots(s, s, ["cards"]), [])
})

test("a changed line shows as missing and added", () => {
  const before = snapshotWith(["Cards", "# Games", "Win%"])
  const after = snapshotWith(["Cards", "#Games", "Win%"])
  assert.deepEqual(compareSnapshots(before, after, ["cards"]), [{ route: "cards", missing: ["# Games"], added: ["#Games"] }])
})

test("routes cover the new pages", () => {
  for (const route of ["welcome", "polyverse", "polyverse/decks", "polyverse/import/ocr", "cc:polyversal", "cc:polyversal/drafts"]) {
    assert.ok(ROUTES.includes(route), route)
  }
  assert.ok(!ROUTES.some(route => route.startsWith("cc:polyversal/import")))
  assert.equal(routeHash("welcome"), "/")
  assert.equal(routeHash("polyverse"), "/polyverse")
})

test("shot names carry the scheme and width", () => {
  const light = shotName("polyverse/decks", "light", 1680)
  const dark = shotName("polyverse/decks", "dark", 390)
  assert.equal(dark, "polyverse_decks-dark-390.png")
  assert.notEqual(light, dark)
})

test("percentChanged reads 0.00% when nothing changed", () => {
  assert.equal(percentChanged(0, 1000), "0.00%")
  assert.equal(percentChanged(5, 1000), "0.50%")
  assert.equal(percentChanged(5, 10000000), "<0.01%")
})
