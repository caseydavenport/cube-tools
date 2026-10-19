import { test } from "node:test"
import assert from "node:assert/strict"
import { cubeMeta } from "./cubeMeta.js"

const CUBES = { cubes: [{ id: "polyverse", name: "Polyverse", description: "Home cube." }] }

test("a listed cube uses its configured name and description", () => {
  assert.deepEqual(cubeMeta(CUBES, undefined, "polyverse"), { id: "polyverse", name: "Polyverse", description: "Home cube." })
})

test("a CubeCobra cube isn't listed, so it's named by its id", () => {
  assert.deepEqual(cubeMeta(CUBES, undefined, "cc:polyversal"), { id: "cc:polyversal", name: "polyversal" })
})

test("a failed cube list still names the cube by its id", () => {
  assert.deepEqual(cubeMeta(undefined, "500 Internal Server Error", "polyverse"), { id: "polyverse", name: "polyverse" })
})

test("while the cube list is loading there is no name yet", () => {
  assert.equal(cubeMeta(undefined, undefined, "polyverse"), undefined)
})
