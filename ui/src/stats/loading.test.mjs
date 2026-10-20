import { test } from "node:test"
import assert from "node:assert/strict"
import { failedState, fromCallback, loadedState, shownState, startLoad } from "./loading.js"

// settle lets pending promise callbacks run.
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test("reports the loaded value", async () => {
  let got = null
  startLoad(async () => 7, value => { got = value }, () => {})
  await settle()
  assert.equal(got, 7)
})

test("reports a failure", async () => {
  let failed = null
  startLoad(async () => { throw new Error("boom") }, () => {}, err => { failed = err })
  await settle()
  assert.equal(failed.message, "boom")
})

test("a cancelled load reports nothing", async () => {
  let calls = 0
  const cancel = startLoad(async () => 7, () => { calls++ }, () => { calls++ })
  cancel()
  await settle()
  assert.equal(calls, 0)
})

test("fromCallback resolves with what the loader passes", async () => {
  const value = await fromCallback(async resolve => { resolve([1, 2]) })
  assert.deepEqual(value, [1, 2])
})

test("fromCallback rejects when the loader's promise does", async () => {
  await assert.rejects(fromCallback(async () => { throw new Error("network") }), /network/)
})

test("a value loaded for another cube isn't shown", () => {
  assert.deepEqual(shownState(loadedState("a", [1]), "b", []), { value: [], loaded: false, failed: false })
})

test("a value for this cube is shown", () => {
  assert.deepEqual(shownState(loadedState("a", [1]), "a", []), { value: [1], loaded: true, failed: false })
})

test("a failure keeps this cube's last value", () => {
  assert.deepEqual(failedState(loadedState("a", [1]), "a"), { cube: "a", value: [1], failed: true })
})

test("a failure doesn't keep another cube's value", () => {
  assert.equal(failedState(loadedState("a", [1]), "b").value, undefined)
})

test("a later success clears the failure", () => {
  assert.equal(loadedState("a", [2]).failed, false)
})
