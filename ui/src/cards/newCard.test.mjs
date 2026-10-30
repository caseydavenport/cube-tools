import { test } from "node:test"
import assert from "node:assert/strict"
import { isNewCard } from "./newCard.js"

test("a card in fewer than five drafts is new", () => {
  assert.equal(isNewCard(4), true)
  assert.equal(isNewCard(5), false)
  assert.equal(isNewCard(0), true)
})
