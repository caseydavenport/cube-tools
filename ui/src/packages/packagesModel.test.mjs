import { test } from "node:test"
import assert from "node:assert/strict"
import { builtInText, cameTogetherText, defaultView, mapNodes, sharedGroupsOf, viewFrom } from "./packagesModel.js"

test("the index opens on the table when there are decks, else the map", () => {
  assert.equal(defaultView(true), "table")
  assert.equal(defaultView(false), "map")
})

test("the view comes from the URL, falling back to the default", () => {
  assert.equal(viewFrom(new URLSearchParams("view=map"), true), "map")
  assert.equal(viewFrom(new URLSearchParams("view=nonsense"), true), "table")
  assert.equal(viewFrom(new URLSearchParams(""), false), "map")
})

test("built in reads as decks and a share", () => {
  assert.equal(builtInText({ package: 111, buildRate: 0.449 }), "111 decks · 45%")
  assert.equal(builtInText({ package: 1, buildRate: 0.004 }), "1 deck · 0%")
})

test("came together is a percent, or a dash when no deck had the cards", () => {
  assert.equal(cameTogetherText({ has3: 166, cameTogether: 0.669 }), "67%")
  assert.equal(cameTogetherText({ has3: 0, cameTogether: 0 }), "—")
})

// sixPackages are packages with builds 60 down to 10 and card counts 1 up to 6.
const sixPackages = [60, 50, 40, 30, 20, 10].map((built, i) => ({
  name: `P${i}`, package: built, cardCount: i + 1, color: "R",
}))

test("map nodes keep labels at rest only for the largest third", () => {
  const nodes = mapNodes(sixPackages, true)
  const loud = nodes.filter(n => !n.quiet).map(n => n.id)
  assert.deepEqual(loud, ["P0", "P1"])
  assert.equal(nodes[5].label, "P5")
  assert.ok(nodes[0].radius > nodes[5].radius)
})

test("without decks, map nodes size by card count", () => {
  const nodes = mapNodes(sixPackages, false)
  assert.ok(nodes[5].radius > nodes[0].radius)
  const loud = nodes.filter(n => !n.quiet).map(n => n.id)
  assert.deepEqual(loud, ["P4", "P5"])
})

test("a package's neighbors list the groups they share", () => {
  const edges = [
    { source: "P", target: "Q", groups: ["Graveyard"] },
    { source: "R", target: "P", groups: ["Tokens", "Sacrifice"] },
    { source: "Q", target: "R", groups: ["Lands"] },
  ]
  assert.deepEqual(sharedGroupsOf("P", edges), [
    { name: "Q", groups: ["Graveyard"] },
    { name: "R", groups: ["Tokens", "Sacrifice"] },
  ])
})
