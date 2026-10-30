import { test } from "node:test"
import assert from "node:assert/strict"
import { buildDeckSubgraph, dominantLabel } from "./DeckGraph.js"

test("buildDeckSubgraph keeps each edge's package names", () => {
  const edges = [{ source: "B", target: "A", weight: 2, packages: ["Ramp", "Graveyard"] }]
  const g = buildDeckSubgraph(["A", "B"], edges)
  assert.deepEqual(g.edges[0].labels, ["Graveyard", "Ramp"])
})

test("dominantLabel names a community by its heaviest package", () => {
  const edges = [
    { source: "A", target: "B", weight: 3, packages: ["Graveyard"] },
    { source: "B", target: "C", weight: 1, packages: ["Ramp"] },
  ]
  const g = buildDeckSubgraph(["A", "B", "C"], edges)
  assert.equal(dominantLabel(g, ["A", "B", "C"]), "Graveyard")
})
