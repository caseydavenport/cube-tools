import { test } from "node:test"
import assert from "node:assert/strict"
import { deckCommunities, deckPackageCards } from "./deckCommunities.js"
import { ruleColor } from "./ruleColors.js"

// edge is a design graph edge carrying the given packages.
function edge(source, target, ...packages) {
  return { source, target, weight: packages.length, packages }
}

// twoClusters is a Tokens triangle and a Graveyard triangle joined by one
// Sacrifice link, plus a card with no links.
const names = ["A", "B", "C", "D", "E", "F", "Loner"]
const edges = [
  edge("A", "B", "Tokens"), edge("A", "C", "Tokens"), edge("B", "C", "Tokens"),
  edge("D", "E", "Graveyard"), edge("D", "F", "Graveyard"), edge("E", "F", "Graveyard"),
  edge("C", "D", "Sacrifice"),
]
const packageIndex = { Graveyard: 0, Sacrifice: 1, Tokens: 2 }

test("communities are named by their heaviest package and colored by it", () => {
  const { list } = deckCommunities(names, edges, packageIndex)
  assert.deepEqual(
    list.map(c => [c.label, c.members, c.color]),
    [
      ["Tokens", ["A", "B", "C"], ruleColor(2)],
      ["Graveyard", ["D", "E", "F"], ruleColor(0)],
    ],
  )
})

test("a card in no community gets no color and isn't listed", () => {
  const { list, colorOf } = deckCommunities(names, edges, packageIndex)
  assert.equal(colorOf.Loner, null)
  assert.ok(!list.some(c => c.members.includes("Loner")))
})

test("two communities wanting one color get different colors", () => {
  const { list } = deckCommunities(names, edges, { Graveyard: 0, Sacrifice: 1, Tokens: 20 })
  assert.notEqual(list[0].color, list[1].color)
})

test("each package's deck cards are those its links touch", () => {
  const members = deckPackageCards(names, edges)
  assert.deepEqual(members.Tokens, ["A", "B", "C"])
  assert.deepEqual(members.Sacrifice, ["C", "D"])
  assert.equal(members.Loner, undefined)
})

test("links to cards outside the pool don't count", () => {
  const members = deckPackageCards(["A", "B"], [edge("A", "B", "Tokens"), edge("A", "Z", "Ramp")])
  assert.deepEqual(members, { Tokens: ["A", "B"] })
})
