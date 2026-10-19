import { test } from "node:test"
import assert from "node:assert/strict"
import { effectiveCards, matchKey, membershipsByCard, requestForConditions, requestForGroups } from "./DesignRules.js"

const firstStrike = 't:creature o:"first strike"'
const trample = "t:creature o:trample"
const buff = () => ({ name: "Buff targets", conditions: [firstStrike, trample], exclude: ["Blade Splicer"] })
const ramp = () => ({ name: "Ramp", conditions: ["o:search"], exclude: [] })

test("requestForGroups labels each condition with its group and matches card: entries by name", () => {
  assert.deepEqual(requestForGroups(["Buff targets", "card:Ozzy's Bat"], [buff(), ramp()]), {
    conditions: [firstStrike, trample, `n:"Ozzy's Bat"`],
    groups: ["Buff targets", "Buff targets", "card:Ozzy's Bat"],
  })
  assert.deepEqual(requestForGroups(["", "Missing"], [buff()]), { conditions: [], groups: [] })
})

test("requestForConditions trims, drops empties, and labels with the group when given", () => {
  assert.deepEqual(requestForConditions([" o:trample ", "", "  "], "Buff targets"), {
    conditions: ["o:trample"],
    groups: ["Buff targets"],
  })
  assert.deepEqual(requestForConditions([" o:trample "], null), { conditions: ["o:trample"], groups: [] })
})

test("effectiveCards drops excluded conditions and cards left with none", () => {
  const cards = [
    { name: "Blade Splicer", conditions: [{ condition: firstStrike, group: "Buff targets", excluded: true }] },
    {
      name: "Freddie's Axe",
      conditions: [
        { condition: firstStrike, group: "Buff targets", excluded: true },
        { condition: trample, group: "Other" },
      ],
    },
  ]
  assert.deepEqual(effectiveCards(cards), [
    { name: "Freddie's Axe", conditions: [{ condition: trample, group: "Other" }] },
  ])
})

test("membershipsByCard leaves out groups a card is excluded from", () => {
  const cards = [
    { name: "Blade Splicer", conditions: [{ condition: firstStrike, group: "Buff targets", excluded: true }] },
    {
      name: "Stevie's Steed",
      conditions: [
        { condition: firstStrike, group: "Buff targets" },
        { condition: trample, group: "Buff targets" },
      ],
    },
  ]
  assert.deepEqual(membershipsByCard(cards), {
    "Blade Splicer": [],
    "Stevie's Steed": [{ group: "Buff targets", conds: [firstStrike, trample] }],
  })
})

test("matchKey changes with a named group's exclude list only", () => {
  const request = requestForGroups(["Buff targets"], [buff()])
  const edited = { ...buff(), exclude: ["Blade Splicer", "Inti, Seneschal of the Sun"] }
  const otherRamp = { ...ramp(), exclude: ["Cultivate"] }

  assert.equal(matchKey(request, [buff(), ramp()]), matchKey(request, [buff(), ramp()]))
  assert.notEqual(matchKey(request, [buff()]), matchKey(request, [edited]))
  assert.equal(matchKey(request, [buff(), ramp()]), matchKey(request, [buff(), otherRamp]))
})
