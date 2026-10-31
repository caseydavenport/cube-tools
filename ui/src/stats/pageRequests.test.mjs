import { test } from "node:test"
import assert from "node:assert/strict"
import { colorStatsUrl, linkCheckUrl, packageUrl, packagesUrl, pivotRequest, ruleGroupsUrl, rulesBoardUrl } from "./pageRequests.js"

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

test("colorStatsUrl sends the confidence with and without time buckets", () => {
  const filters = { start: "", end: "", size: 0, colorMode: "inclusive", confidence: "0.8", match: "" }
  const plain = colorStatsUrl("polyverse", filters, 0)
  const bucketed = colorStatsUrl("polyverse", filters, 3)
  assert.match(plain, /confidence=0.8/)
  assert.doesNotMatch(plain, /bucket_size/)
  assert.match(bucketed, /confidence=0.8/)
  assert.match(bucketed, /bucket_size=3&sliding=true/)
})

test("packageUrl names the package and leaves out an empty range", () => {
  const url = packageUrl("polyverse", { name: "Auras/Equipment", start: "", end: "2026-01-01", confidence: "0.8" })
  assert.equal(url, "/api/polyverse/stats/package?name=Auras%2FEquipment&end=2026-01-01&confidence=0.8")
})

test("linkCheckUrl names both cards", () => {
  assert.equal(linkCheckUrl("polyverse", "Fire // Ice", "Shock"), "/api/polyverse/stats/link-check?a=Fire+%2F%2F+Ice&b=Shock")
})

test("rulesBoardUrl leaves out an empty range", () => {
  assert.equal(rulesBoardUrl("polyverse", { start: "", end: "2026-01-01" }), "/api/polyverse/stats/rules-board?end=2026-01-01")
})

test("ruleGroupsUrl names a package or a group", () => {
  assert.equal(ruleGroupsUrl("polyverse", { package: "Auras/Equipment" }), "/api/polyverse/stats/rule-groups?package=Auras%2FEquipment")
  assert.equal(ruleGroupsUrl("polyverse", { group: "Fodder" }), "/api/polyverse/stats/rule-groups?group=Fodder")
})

test("ruleGroupsUrl adds the date range, leaving out an empty date", () => {
  assert.equal(ruleGroupsUrl("polyverse", { group: "Fodder" }, { start: "", end: "2026-01-01" }), "/api/polyverse/stats/rule-groups?group=Fodder&end=2026-01-01")
})
