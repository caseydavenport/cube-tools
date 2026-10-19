import { test } from "node:test"
import assert from "node:assert/strict"
import { compareBy, nextSort } from "./sortOrder.js"

test("clicking the sorted column flips its direction", () => {
  assert.deepEqual(nextSort({ key: "cost", dir: "desc" }, "cost", true), { key: "cost", dir: "asc" })
  assert.deepEqual(nextSort({ key: "cost", dir: "asc" }, "cost", true), { key: "cost", dir: "desc" })
})

test("a new number column starts high to low", () => {
  assert.deepEqual(nextSort({ key: "name", dir: "asc" }, "cost", true), { key: "cost", dir: "desc" })
})

test("a new text column starts A to Z", () => {
  assert.deepEqual(nextSort({ key: "cost", dir: "desc" }, "name", false), { key: "name", dir: "asc" })
})

test("compareBy orders by a value, in either direction", () => {
  const rows = [{ n: 2 }, { n: 3 }, { n: 1 }]
  const value = row => row.n
  assert.deepEqual([...rows].sort(compareBy(value, "asc")).map(r => r.n), [1, 2, 3])
  assert.deepEqual([...rows].sort(compareBy(value, "desc")).map(r => r.n), [3, 2, 1])
})
