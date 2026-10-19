import { test } from "node:test"
import assert from "node:assert/strict"
import { LIGHT, DARK, PRIMARY_SHADES, MANA } from "./tokens.js"

const HEX = /^#[0-9a-f]{6}$/

test("light and dark define the same tokens, all hex colors", () => {
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort())
  for (const v of [...Object.values(LIGHT), ...Object.values(DARK)]) assert.match(v, HEX)
})

test("the primary palette has ten shades for Mantine", () => {
  assert.equal(PRIMARY_SHADES.length, 10)
  for (const v of PRIMARY_SHADES) assert.match(v, HEX)
})

test("mana colors cover WUBRG", () => {
  assert.deepEqual(Object.keys(MANA).sort(), ["B", "G", "R", "U", "W"])
})
