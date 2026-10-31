import { test } from "node:test"
import assert from "node:assert/strict"
import { changePage, followLink, linkFilterStart, typeFilter } from "./linkFilter.js"

test("a link's filter is undone once you leave the page it opened", () => {
  let state = linkFilterStart('arch:aggro')
  state = followLink(state, 'card:"Toxic Deluge"', "cards")
  assert.equal(state.match, 'card:"Toxic Deluge"')

  state = changePage(state, "decks")
  assert.equal(state.match, 'card:"Toxic Deluge"')

  state = changePage(state, "cards")
  assert.equal(state.match, "arch:aggro")
  assert.equal(state.saved, null)
})

test("staying on the page that was opened keeps the link's filter", () => {
  let state = followLink(linkFilterStart(""), 'player:"Ozzy"', "players")
  state = changePage(state, "players")
  assert.equal(state.match, 'player:"Ozzy"')
  state = changePage(state, "decks")
  state = changePage(state, "decks")
  assert.equal(state.match, 'player:"Ozzy"')
})

test("typing a new filter makes it stick", () => {
  let state = followLink(linkFilterStart(""), 'card:"Shock"', "cards")
  state = changePage(state, "decks")
  state = typeFilter(state, 'card:"Shock" arch:aggro')
  state = changePage(state, "colors")
  assert.equal(state.match, 'card:"Shock" arch:aggro')
})

test("re-sending the same filter, as a page does on load, changes nothing", () => {
  let state = followLink(linkFilterStart("arch:control"), 'card:"Shock"', "cards")
  state = changePage(state, "decks")
  state = typeFilter(state, 'card:"Shock"')
  state = changePage(state, "cards")
  assert.equal(state.match, "arch:control")
})

test("a second link keeps the filter from before the first", () => {
  let state = followLink(linkFilterStart("arch:control"), 'player:"Joan"', "players")
  state = followLink(state, 'card:"Shock"', "players")
  state = changePage(state, "decks")
  state = changePage(state, "colors")
  assert.equal(state.match, "arch:control")
})

test("without a link, page changes leave the filter alone", () => {
  let state = typeFilter(linkFilterStart(""), "arch:aggro")
  state = changePage(state, "colors")
  assert.equal(state.match, "arch:aggro")
})
