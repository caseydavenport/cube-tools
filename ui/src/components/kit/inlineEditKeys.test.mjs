import { test } from "node:test"
import assert from "node:assert/strict"
import { inlineEditKeys } from "./inlineEditKeys.js"

test("Enter saves an inline edit", () => {
  assert.equal(inlineEditKeys("Enter"), "save")
})

test("Escape cancels an inline edit", () => {
  assert.equal(inlineEditKeys("Escape"), "cancel")
})

test("other keys do nothing", () => {
  assert.equal(inlineEditKeys("a"), null)
})
