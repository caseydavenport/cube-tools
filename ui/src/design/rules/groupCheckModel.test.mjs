import { test } from "node:test"
import assert from "node:assert/strict"
import { checkRequest, checkSummary, failedConditions } from "./groupCheckModel.js"

// result builds a group check answer from its conditions.
function result(inGroup, excluded, conditions) {
  return { card: "Sakura-Tribe Elder", in_group: inGroup, excluded, conditions }
}

const failed = { condition: 'o:dies t:creature', matched: false, parts: [{ text: "o:dies", matched: false }, { text: "t:creature", matched: true }] }
const passed = { condition: 'o:"sacrifice this creature"', matched: true, parts: [{ text: 'o:"sacrifice this creature"', matched: true }] }

test("the summary names the condition a member matched", () => {
  assert.equal(checkSummary(result(true, false, [failed, passed])), 'Sakura-Tribe Elder is in this group: it matched o:"sacrifice this creature"')
})

test("the summary says when the exclude list keeps a card out", () => {
  assert.equal(checkSummary(result(false, true, [passed])), "Sakura-Tribe Elder matches, but the group excludes it by name")
})

test("the summary says a card that matches nothing isn't in", () => {
  assert.equal(checkSummary(result(false, false, [failed])), "Sakura-Tribe Elder isn't in this group: no condition matched")
})

test("only failed conditions are listed for a card that isn't in", () => {
  assert.deepEqual(failedConditions(result(false, false, [failed, passed])), [failed])
})

test("a check of an unsaved group drops blank conditions and excludes", () => {
  const body = checkRequest("Black Lotus", "Untitled", [' n:"Black Lotus" ', ""], ["Mox Pearl", ""])
  assert.deepEqual(JSON.parse(body), {
    card: "Black Lotus",
    group: { name: "Untitled", conditions: ['n:"Black Lotus"'], exclude: ["Mox Pearl"] },
  })
})
