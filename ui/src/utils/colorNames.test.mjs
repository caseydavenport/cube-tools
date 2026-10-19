import { test } from "node:test"
import assert from "node:assert/strict"
import { colorName, WUBRG } from "./colorNames.js"

test("single colors, guilds, and shards have names", () => {
  assert.equal(colorName("B"), "Black")
  assert.equal(colorName("BG"), "Golgari")
  assert.equal(colorName("WUB"), "Esper")
})

test("unknown identities fall back to their letters", () => {
  assert.equal(colorName("WUBRG"), "WUBRG")
  assert.equal(colorName(""), "")
})

test("WUBRG lists the five colors in the usual order", () => {
  assert.deepEqual(WUBRG, ["W", "U", "B", "R", "G"])
})
