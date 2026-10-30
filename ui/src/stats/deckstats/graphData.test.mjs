import { test } from "node:test"
import assert from "node:assert/strict"
import { BuildGraphData } from "./graphData.js"

// oneDeckParsed wraps a single deck in one bucket of one draft, the shape
// BuildGraphData reads.
function oneDeckParsed(mainboard) {
  const deck = { metadata: { draft_id: 1 }, id: 1, mainboard, sideboard: [] }
  const draft = { draft: { date: "2026-01-01" }, decks: [deck] }
  return { deckBuckets: [[draft]], filteredDecks: [deck], bucketSize: 1 }
}

test("interaction by color counts hand disruption, like every other interaction count", () => {
  const parsed = oneDeckParsed([
    { name: "Duress", colors: ["B"], cmc: 1, roles: ["hand-disruption"] },
    { name: "Doom Blade", colors: ["B"], cmc: 2, roles: ["removal"] },
    { name: "Opt", colors: ["U"], cmc: 1, roles: ["draw"] },
  ])
  const { bucketed } = BuildGraphData(parsed)
  assert.equal(bucketed.interaction.mb.byColor.get("B")[0], 2)
  assert.equal(bucketed.interaction.mb.byColor.get("U")[0], 0)
  assert.equal(bucketed.removal.mb.count[0], 1, "hand disruption isn't removal")
})
