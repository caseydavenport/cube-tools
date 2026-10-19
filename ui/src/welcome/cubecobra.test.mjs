import { test } from "node:test"
import assert from "node:assert/strict"
import { parseCubeCobraInput } from "./cubecobra.js"

test("bare ids and CubeCobra links give the id", () => {
  assert.equal(parseCubeCobraInput("polyversal"), "polyversal")
  assert.equal(parseCubeCobraInput("  polyversal  "), "polyversal")
  assert.equal(parseCubeCobraInput("https://cubecobra.com/cube/overview/polyversal"), "polyversal")
  assert.equal(parseCubeCobraInput("cubecobra.com/cube/list/ozzy_cube/?view=table"), "ozzy_cube")
  assert.equal(parseCubeCobraInput("https://www.cubecobra.com/cube/playtest/joan-jett#decks"), "joan-jett")
})

test("anything else is rejected", () => {
  assert.equal(parseCubeCobraInput(""), null)
  assert.equal(parseCubeCobraInput("   "), null)
  assert.equal(parseCubeCobraInput("https://example.com/cube/overview/polyversal"), null)
  assert.equal(parseCubeCobraInput("https://cubecobra.com/"), null)
  assert.equal(parseCubeCobraInput("https://cubecobra.com/cube/overview/bad id"), null)
  assert.equal(parseCubeCobraInput("bad id!"), null)
})
