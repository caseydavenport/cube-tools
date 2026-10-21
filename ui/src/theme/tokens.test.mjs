import { test } from "node:test"
import assert from "node:assert/strict"
import { LIGHT, DARK, PRIMARY_SHADES, MANA, SERIES } from "./tokens.js"

const HEX = /^#[0-9a-f]{6}$/

test("light and dark define the same tokens, all colors hex", () => {
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort())
  for (const palette of [LIGHT, DARK]) {
    for (const [key, v] of Object.entries(palette)) {
      if (key !== "shadowPop") assert.match(v, HEX, key)
    }
  }
})

test("the popover shadow is softer in light mode and deeper in dark", () => {
  assert.equal(LIGHT.shadowPop, "0 14px 34px -10px rgb(42 34 56 / 0.22), 0 2px 6px rgb(42 34 56 / 0.06)")
  assert.equal(DARK.shadowPop, "0 18px 44px -10px rgb(0 0 0 / 0.7), 0 2px 8px rgb(0 0 0 / 0.35)")
})

test("the primary palette has ten shades for Mantine", () => {
  assert.equal(PRIMARY_SHADES.length, 10)
  for (const v of PRIMARY_SHADES) assert.match(v, HEX)
})

test("mana colors cover WUBRG", () => {
  assert.deepEqual(Object.keys(MANA).sort(), ["B", "G", "R", "U", "W"])
})

test("the chart series palette has eight colors, none of them a mana color", () => {
  assert.equal(SERIES.length, 8)
  const mana = Object.values(MANA)
  for (const v of SERIES) {
    assert.match(v, HEX)
    assert.ok(!mana.includes(v), v)
  }
})

test("warn is a darker amber in light mode and a lighter one in dark, and shadow mixes from ink or black", () => {
  assert.equal(LIGHT.warn, "#b45309")
  assert.equal(DARK.warn, "#fbbf24")
  assert.equal(LIGHT.shadow, "#2a2238")
  assert.equal(DARK.shadow, "#000000")
})
