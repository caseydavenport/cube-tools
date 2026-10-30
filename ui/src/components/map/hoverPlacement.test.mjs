import { test } from "node:test"
import assert from "node:assert/strict"
import { previewSide } from "./hoverPlacement.js"

test("previewSide puts the preview opposite the node", () => {
  assert.equal(previewSide(100, 800), "right")
  assert.equal(previewSide(700, 800), "left")
  assert.equal(previewSide(400, 800), "right")
})
