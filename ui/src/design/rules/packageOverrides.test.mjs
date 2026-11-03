import { test } from "node:test"
import assert from "node:assert/strict"
import { nextOverrides, shownState, switchValue } from "./packageOverrides.js"

test("forcing a package on moves it off the other list", () => {
  const got = nextOverrides({ on: [], off: ["Snow", "Storm"] }, "Snow", "on")
  assert.deepEqual(got, { on: ["Snow"], off: ["Storm"] })
})

test("following the line takes a package off both lists", () => {
  assert.deepEqual(nextOverrides({ on: ["Snow"], off: [] }, "Snow", "line"), { on: [], off: [] })
})

test("a package is never listed twice, whatever the case", () => {
  assert.deepEqual(nextOverrides({ on: ["snow"], off: [] }, "Snow", "on"), { on: ["Snow"], off: [] })
})

test("the input overrides are left as they were", () => {
  const before = { on: ["Snow"], off: [] }
  nextOverrides(before, "Storm", "off")
  assert.deepEqual(before, { on: ["Snow"], off: [] })
})

test("missing lists read as empty", () => {
  assert.deepEqual(nextOverrides({}, "Snow", "off"), { on: [], off: ["Snow"] })
})

test("a package's shown state is its forced setting, or the line", () => {
  assert.equal(shownState(""), "line")
  assert.equal(shownState("on"), "on")
  assert.equal(shownState("off"), "off")
})

test("the switch shows a choice still saving over the server's value", () => {
  assert.equal(switchValue("on", ""), "on")
  assert.equal(switchValue(null, "off"), "off")
  assert.equal(switchValue(null, ""), "line")
})
