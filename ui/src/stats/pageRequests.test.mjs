import { test } from "node:test"
import assert from "node:assert/strict"
import { packagesUrl, pivotRequest } from "./pageRequests.js"

test("packagesUrl leaves out empty dates and filter", () => {
  const url = packagesUrl("polyverse", { confidence: "0.8", start: "", end: "", match: "" })
  assert.equal(url, "/api/polyverse/stats/packages?confidence=0.8")
})

test("packagesUrl carries the dates and filter", () => {
  const url = packagesUrl("polyverse", { confidence: "0.9", start: "2026-01-01", end: "2026-06-30", match: "player:Ozzy" })
  assert.equal(url, "/api/polyverse/stats/packages?confidence=0.9&start=2026-01-01&end=2026-06-30&match=player%3AOzzy")
})

// pivotInput is a Charts query with every field set, for the tests to vary.
function pivotInput(changes) {
  return {
    start: "2026-01-01",
    end: "2026-06-30",
    groupBy: { dim: "color", granularity: 1, color_mode: "inclusive" },
    splitBy: { dim: "", granularity: 1, color_mode: "inclusive" },
    bucketSize: "3",
    usesTime: false,
    predicates: [
      { dim: "card_query", op: "includes", value: "" },
      { dim: "card_query", op: "includes", value: "Bolt" },
    ],
    excluded: new Set(["Ozzy"]),
    confidence: "0.8",
    match: "arch:aggro",
    ...changes,
  }
}

test("pivotRequest carries the deck filter", () => {
  const body = pivotRequest(pivotInput({}))
  assert.equal(body.match, "arch:aggro")
  assert.deepEqual(body.predicates, [{ dim: "card_query", op: "includes", value: "Bolt" }])
  assert.equal(body.bucket_size, 0)
  assert.deepEqual(body.exclude_players, ["Ozzy"])
  assert.equal(body.confidence, 0.8)
  assert.equal(pivotRequest(pivotInput({ usesTime: true })).bucket_size, 3)
})
