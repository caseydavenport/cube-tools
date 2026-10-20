import { test } from "node:test"
import assert from "node:assert/strict"
import { readableRuleColor } from "./ruleColors.js"

test("rule text mixes the color toward the text color", () => {
  assert.equal(readableRuleColor("#f0c0d0"), "color-mix(in srgb, #f0c0d0 45%, var(--se-text))")
})
