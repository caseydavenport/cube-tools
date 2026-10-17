import { test } from "node:test"
import assert from "node:assert/strict"
import { draftLabel, compareDrafts, eventTerms } from "./DraftInfo.js"

test("label shows date and event name, plus flight when set", () => {
  assert.equal(draftLabel({ id: 4, date: "2026-10-13", event_name: "Adventurer's Guild" }), "2026-10-13 · Adventurer's Guild")
  assert.equal(draftLabel({ id: 4, date: "2026-06-20", event_name: "Boston Cube", flight: "Saturday" }), "2026-06-20 · Boston Cube (Saturday)")
})

test("label falls back to the draft number without an event name", () => {
  assert.equal(draftLabel({ id: 51, date: "2026-10-20" }), "2026-10-20 · #51")
})

test("label is empty for a missing draft", () => {
  assert.equal(draftLabel(undefined), "")
  assert.equal(draftLabel(null), "")
})

test("compareDrafts orders by date, then numeric id", () => {
  const drafts = [
    { id: 10, date: "2026-01-01" },
    { id: 2, date: "2026-02-01" },
    { id: 9, date: "2026-01-01" },
  ]
  assert.deepEqual(drafts.sort(compareDrafts).map(d => d.id), [9, 10, 2])
})

test("eventTerms lists the code, name and flight that are set", () => {
  assert.deepEqual(eventTerms({ id: 3, event_code: "bcp26", event_name: "Boston Cube", flight: "Saturday" }), ["bcp26", "Boston Cube", "Saturday"])
  assert.deepEqual(eventTerms({ id: 3, event_code: "local" }), ["local"])
  assert.deepEqual(eventTerms(undefined), [])
})
