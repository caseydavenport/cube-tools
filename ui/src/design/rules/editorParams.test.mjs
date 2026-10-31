import { test } from "node:test"
import assert from "node:assert/strict"
import { nextEditorParams } from "./editorParams.js"

test("an empty value removes the param", () => {
  const { params } = nextEditorParams(new URLSearchParams("q=arid&sort=built"), { q: "" })
  assert.equal(params.toString(), "sort=built")
})

test("changing view clears the group check card", () => {
  const { params } = nextEditorParams(new URLSearchParams("view=g%3AFodder&check=Mayhem+Devil"), { view: "p:Reanimate" })
  assert.equal(params.get("check"), null)
  assert.equal(params.get("view"), "p:Reanimate")
})

test("a view change adds a history entry, so Back returns", () => {
  assert.equal(nextEditorParams(new URLSearchParams(""), { view: "p:Delirium" }).push, true)
  assert.equal(nextEditorParams(new URLSearchParams("view=p%3ADelirium"), { view: "" }).push, true)
})

test("search, sort and the same view replace the current entry", () => {
  assert.equal(nextEditorParams(new URLSearchParams(""), { q: "arid" }).push, false)
  assert.equal(nextEditorParams(new URLSearchParams("view=review"), { card: "Abrade" }).push, false)
  assert.equal(nextEditorParams(new URLSearchParams("view=review"), { view: "review" }).push, false)
})

test("the starting params are left alone", () => {
  const start = new URLSearchParams("view=g%3AFodder&check=Mayhem+Devil")
  nextEditorParams(start, { view: "" })
  assert.equal(start.toString(), "view=g%3AFodder&check=Mayhem+Devil")
})
