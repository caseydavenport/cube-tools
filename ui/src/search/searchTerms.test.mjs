import { test } from "node:test"
import assert from "node:assert/strict"
import { hasTerm, helpText, pillKind, splitPills, suggestions, toggleTerm } from "./searchTerms.js"

// KEYWORDS is a slice of the server's keyword table.
const KEYWORDS = [
  { name: "t", aliases: ["type"], scope: "card", kind: "text", operators: [":", "=", "!="], description: "Card type.", example: "t:creature", values: ["creature", "instant"] },
  { name: "c", aliases: ["color"], scope: "card", kind: "color", operators: [":", "=", "!=", "<", "<=", ">", ">="], description: "Card colors.", example: "c<=ug", values: ["w", "u", "b", "r", "g", "m", "c"] },
  { name: "is", scope: "card", kind: "choice", operators: [":", "=", "!="], description: "A role.", example: "is:removal", values: ["removal", "interaction"] },
  { name: "arch", scope: "deck", kind: "text", operators: [":", "=", "!="], description: "Archetype.", example: "arch:aggro" },
  { name: "otag", scope: "card", kind: "text", operators: [":", "=", "!="], description: "Oracle tag.", example: "otag:removal" },
]

test("splitPills keeps quotes and groups whole", () => {
  assert.deepEqual(splitPills('t:creature o:"draw a card" (c:u or c:r) bol'), {
    pills: ["t:creature", 'o:"draw a card"', "(c:u or c:r)"],
    current: "bol",
  })
  assert.deepEqual(splitPills("t:creature "), { pills: ["t:creature"], current: "" })
  assert.deepEqual(splitPills(""), { pills: [], current: "" })
})

test("pillKind marks deck terms and invalid ones", () => {
  assert.equal(pillKind("t:creature", KEYWORDS), "card")
  assert.equal(pillKind("-type:creature", KEYWORDS), "card")
  assert.equal(pillKind("arch:aggro", KEYWORDS), "deck")
  assert.equal(pillKind("foo:bar", KEYWORDS), "invalid")
  assert.equal(pillKind("t<creature", KEYWORDS), "invalid")
  assert.equal(pillKind("is:dragon", KEYWORDS), "invalid")
  assert.equal(pillKind("is:removal", KEYWORDS), "card")
  assert.equal(pillKind("bolt", KEYWORDS), "card")
})

test("suggestions offer keywords for a word", () => {
  const got = suggestions("ty", KEYWORDS).map(s => s.text)
  assert.deepEqual(got, ["t:"])
})

test("suggestions offer the keyword's values, keeping a negation", () => {
  assert.deepEqual(suggestions("-is:int", KEYWORDS).map(s => s.text), ["-is:interaction"])
})

test("suggestions offer the page's tags for otag", () => {
  const sources = { tags: { otag: [{ value: "removal", description: "120 cards" }, { value: "ramp", description: "40 cards" }] } }
  assert.deepEqual(suggestions("otag:ra", KEYWORDS, sources).map(s => s.text), ["otag:ramp"])
})

test("suggestions grow a color a letter at a time", () => {
  assert.deepEqual(suggestions("c<=u", KEYWORDS).map(s => s.text), ["c<=uw", "c<=ub", "c<=ur", "c<=ug"])
})

test("suggestions offer nothing for an unknown keyword", () => {
  assert.deepEqual(suggestions("foo:", KEYWORDS), [])
})

test("toggleTerm adds a missing term and removes a present one", () => {
  assert.equal(toggleTerm("", "is:removal"), "is:removal ")
  assert.equal(toggleTerm("t:creature", "is:removal"), "t:creature is:removal ")
  assert.equal(toggleTerm("t:creature is:removal ", "is:removal"), "t:creature ")
  assert.equal(toggleTerm("is:removal", "is:removal"), "")
})

test("hasTerm finds whole terms only", () => {
  assert.equal(hasTerm("t:creature -t:land", "-t:land"), true)
  assert.equal(hasTerm("t:creature -t:land", "t:land"), false)
})

test("helpText explains a keyword once it is typed", () => {
  assert.equal(helpText("c:", KEYWORDS), "Card colors. For example, c<=ug")
  assert.equal(helpText("bolt", KEYWORDS), null)
})
