import { test } from "node:test"
import assert from "node:assert/strict"
import { HOME_BLOCKS, blockState } from "./homeBlocks.js"

const CARD_LIST_ONLY = { writable: false, decks: false, results: false, pick_logs: false, archetypes: false, sideboards: false }
const CC_WITH_RECORDS = { writable: false, decks: true, results: true, pick_logs: false, archetypes: false, sideboards: false }
const LOCAL_FULL = { writable: true, decks: true, results: true, pick_logs: true, archetypes: true, sideboards: true }

// reasons maps each block name to its dimming reason for the given cube info.
function reasons(info) {
  const out = {}
  for (const [name, block] of Object.entries(HOME_BLOCKS)) {
    out[name] = blockState(block, info).reason
  }
  return out
}

test("a card-list-only cube can show only the drafts tile", () => {
  assert.deepEqual(reasons(CARD_LIST_ONLY), {
    draftsTile: null,
    archetypeTile: "needs decks",
    colorPairTile: "needs decks",
    cardTile: "needs decks",
    recentDrafts: "needs decks",
    colorWinRates: "needs decks",
    topPlayers: "needs decks",
  })
})

test("a CubeCobra cube with records lacks only archetypes", () => {
  const r = reasons(CC_WITH_RECORDS)
  assert.equal(r.archetypeTile, "needs archetypes")
  for (const [name, reason] of Object.entries(r)) {
    if (name !== "archetypeTile") {
      assert.equal(reason, null, name)
    }
  }
})

test("a full local cube and an unknown cube can show every block", () => {
  for (const info of [LOCAL_FULL, {}]) {
    for (const reason of Object.values(reasons(info))) {
      assert.equal(reason, null)
    }
  }
})
