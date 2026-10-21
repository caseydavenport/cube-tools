import { test } from "node:test"
import assert from "node:assert/strict"
import { compareSnapshots, percentChanged, ROUTES, formatBox, growBox, routeHash, shotName, unfinishedRoutes, unknownRoutes, onlyOutputProblem } from "./text-snapshot.mjs"

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

test("routes cover the welcome, deck, draft and import pages", () => {
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

test("unfinishedRoutes lists pages showing a loading or error message", () => {
  const snapshot = {
    routes: {
      ok: { lines: ["Cards", "12 decks"] },
      loading: { lines: ["Decks", "Loading…"] },
      failed: { lines: ["Couldn't load this"] },
    },
  }
  assert.deepEqual(unfinishedRoutes(snapshot), [
    { route: "loading", marker: "Loading…" },
    { route: "failed", marker: "Couldn't load" },
  ])
})

test("growBox grows a box around each pixel and formatBox describes it", () => {
  let box = growBox(null, 5, 7)
  assert.deepEqual(box, { x0: 5, y0: 7, x1: 5, y1: 7 })
  box = growBox(box, 2, 9)
  box = growBox(box, 6, 3)
  assert.deepEqual(box, { x0: 2, y0: 3, x1: 6, y1: 9 })
  assert.equal(formatBox(box), "2,3 to 6,9 (5 x 7)")
  assert.equal(formatBox(null), "none")
})

test("unfinishedRoutes flags empty counts except on a filtered route", () => {
  const snapshot = {
    routes: {
      "cc:polyversal/cards": { lines: ["0 drafts · 0 decks · 0 players"] },
      "polyverse/cards?match=player%3Anobodyatall": { lines: ["0 drafts · 0 decks · 0 players"] },
      "polyverse/cards": { lines: ["47 drafts · 264 decks · 138 players"] },
    },
  }
  assert.deepEqual(unfinishedRoutes(snapshot), [{ route: "cc:polyversal/cards", marker: "0 drafts · 0 decks" }])
})

test("a card name containing Loading is not an unfinished page", () => {
  const snapshot = { routes: { "cc:polyversal/cards": { lines: ["Cards", "Loading Dock", "Preloading Engine", "12 decks"] } } }
  assert.deepEqual(unfinishedRoutes(snapshot), [])
})

test("each page's own loading text counts as unfinished", () => {
  for (const text of ["Loading…", "Loading removal…", "Loading packages…", "Loading design map…"]) {
    assert.deepEqual(unfinishedRoutes({ routes: { r: { lines: ["Title", text] } } }), [{ route: "r", marker: text }])
  }
})

test("unknownRoutes lists names that are not in ROUTES", () => {
  assert.deepEqual(unknownRoutes([ROUTES[0], "polyverse/cardz", "welcome"]), ["polyverse/cardz"])
  assert.deepEqual(unknownRoutes([ROUTES[0]]), [])
})

test("onlyOutputProblem refuses an --only output that already exists", () => {
  assert.match(onlyOutputProblem(true, "base.json", () => true), /base\.json/)
  assert.equal(onlyOutputProblem(true, "new.json", () => false), null)
  assert.equal(onlyOutputProblem(false, "base.json", () => true), null)
})
