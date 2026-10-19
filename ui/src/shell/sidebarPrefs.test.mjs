import { test } from "node:test"
import assert from "node:assert/strict"
import { readCollapsed, writeCollapsed } from "./sidebarPrefs.js"

test("collapse state round-trips through storage", () => {
  const store = new Map()
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }
  assert.equal(readCollapsed(), false)
  writeCollapsed(true)
  assert.equal(readCollapsed(), true)
})

test("storage that throws reads as expanded and doesn't break writes", () => {
  globalThis.localStorage = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } }
  assert.equal(readCollapsed(), false)
  assert.doesNotThrow(() => writeCollapsed(true))
})
