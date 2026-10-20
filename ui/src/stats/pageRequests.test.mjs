import { test } from "node:test"
import assert from "node:assert/strict"
import { packagesUrl } from "./pageRequests.js"

test("packagesUrl leaves out empty dates and filter", () => {
  const url = packagesUrl("polyverse", { confidence: "0.8", start: "", end: "", match: "" })
  assert.equal(url, "/api/polyverse/stats/packages?confidence=0.8")
})

test("packagesUrl carries the dates and filter", () => {
  const url = packagesUrl("polyverse", { confidence: "0.9", start: "2026-01-01", end: "2026-06-30", match: "player:Ozzy" })
  assert.equal(url, "/api/polyverse/stats/packages?confidence=0.9&start=2026-01-01&end=2026-06-30&match=player%3AOzzy")
})
