import { test } from "node:test"
import assert from "node:assert/strict"
import { NAV_GROUPS, pageAvailability } from "./sections.js"

const page = path => NAV_GROUPS.flatMap(g => g.pages).find(p => p.path === path)
const reason = (path, info) => pageAvailability(page(path), info).reason

const CARD_LIST_ONLY = { writable: false, decks: false, results: false, pick_logs: false, archetypes: false, sideboards: false }
const CC_WITH_RECORDS = { writable: false, decks: true, results: true, pick_logs: false, archetypes: false, sideboards: false }
const LOCAL_FULL = { writable: true, decks: true, results: true, pick_logs: true, archetypes: true, sideboards: true }

test("a card-list-only cube keeps cube-data pages and dims play data", () => {
  assert.equal(reason("removal", CARD_LIST_ONLY), null)
  assert.equal(reason("synergy-map", CARD_LIST_ONLY), null)
  assert.equal(reason("decks", CARD_LIST_ONLY), "needs decks")
  assert.equal(reason("archetypes", CARD_LIST_ONLY), "needs decks")
  assert.equal(reason("charts", CARD_LIST_ONLY), "needs decks")
  assert.equal(reason("drafts", CARD_LIST_ONLY), "needs pick logs")
  assert.equal(reason("rules-editor", CARD_LIST_ONLY), "read-only")
})

test("a CubeCobra cube with records dims only what it lacks", () => {
  assert.equal(reason("decks", CC_WITH_RECORDS), null)
  assert.equal(reason("charts", CC_WITH_RECORDS), null)
  assert.equal(reason("archetypes", CC_WITH_RECORDS), "needs archetypes")
  assert.equal(reason("drafts", CC_WITH_RECORDS), "needs pick logs")
})

test("a full local cube has every page available", () => {
  for (const p of NAV_GROUPS.flatMap(g => g.pages)) {
    assert.deepEqual(pageAvailability(p, LOCAL_FULL), { available: true, reason: null }, p.path)
  }
})

test("unknown info dims nothing except write-gated pages", () => {
  assert.equal(reason("decks", {}), null)
  assert.equal(reason("archetypes", {}), null)
  assert.equal(reason("rules-editor", {}), "read-only")
})

test("paths are unique", () => {
  const paths = NAV_GROUPS.flatMap(g => g.pages).map(p => p.path)
  assert.equal(new Set(paths).size, paths.length)
})
