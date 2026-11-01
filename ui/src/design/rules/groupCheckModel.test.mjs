import { test } from "node:test"
import assert from "node:assert/strict"
import { checkRequest } from "./groupCheckModel.js"

test("a check of an unsaved group drops blank conditions and excludes", () => {
  const body = checkRequest("Black Lotus", "Untitled", [' n:"Black Lotus" ', ""], ["Mox Pearl", ""])
  assert.deepEqual(JSON.parse(body), {
    card: "Black Lotus",
    group: { name: "Untitled", conditions: ['n:"Black Lotus"'], exclude: ["Mox Pearl"] },
  })
})
