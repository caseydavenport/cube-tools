import { test } from "node:test"
import assert from "node:assert/strict"
import { asEvent, optionKey, toSelectData } from "./controls.js"

test("asEvent wraps a plain value so callers can read e.target.value", () => {
  assert.equal(asEvent(5).target.value, 5)
  assert.equal(asEvent(5).currentTarget.value, 5)
})

test("asEvent carries extra fields such as an id", () => {
  assert.equal(asEvent(true, { id: "W" }).currentTarget.id, "W")
  assert.equal(asEvent(true, { id: "W" }).target.id, "W")
})

test("optionKey makes a key from the value and position", () => {
  assert.equal(optionKey({ value: "a" }, 2), "a-2")
})

test("options with the same value or label still get different keys", () => {
  const options = [{ label: "2025-08-31", value: "x" }, { label: "2025-08-31", value: "x" }]
  const keys = options.map(optionKey)
  assert.notEqual(keys[0], keys[1])
})

test("toSelectData turns option values into strings", () => {
  assert.deepEqual(toSelectData([{ label: "Five", value: 5 }]), [{ value: "5", label: "Five" }])
})
