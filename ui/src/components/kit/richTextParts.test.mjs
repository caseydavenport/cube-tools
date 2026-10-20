import { test } from "node:test"
import assert from "node:assert/strict"
import { richTextParts } from "./richTextParts.js"

test("splits plain and bold parts", () => {
  assert.deepEqual(richTextParts(["Cost is ", { bold: "Reach Δ" }, " = priciest"]), [
    { bold: false, text: "Cost is " },
    { bold: true, text: "Reach Δ" },
    { bold: false, text: " = priciest" },
  ])
})
