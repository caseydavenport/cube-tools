import { test } from "node:test"
import assert from "node:assert/strict"
import { goodBadTint } from "./tints.js"

test("a full gain is a strong good tint", () => {
  assert.equal(goodBadTint(1), "color-mix(in srgb, var(--se-good) 70%, transparent)")
})

test("a half loss is a medium bad tint", () => {
  assert.equal(goodBadTint(-0.5), "color-mix(in srgb, var(--se-bad) 43%, transparent)")
})

test("no change is a faint good tint", () => {
  assert.equal(goodBadTint(0), "color-mix(in srgb, var(--se-good) 15%, transparent)")
})

test("values past the ends are held at the ends", () => {
  assert.equal(goodBadTint(3), goodBadTint(1))
  assert.equal(goodBadTint(-3), goodBadTint(-1))
})
