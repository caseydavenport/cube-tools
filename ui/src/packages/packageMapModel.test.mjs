import { test } from "node:test"
import assert from "node:assert/strict"
import { decksText, depthMatrix, layoutMap, threadWeight } from "./packageMapModel.js"

// mapOf builds a package map from wires written as [sources, targets],
// with a group for every entry they name.
function mapOf(wires) {
  const names = []
  for (const [sources, targets] of wires) {
    for (const name of [...sources, ...targets]) {
      if (!names.includes(name)) {
        names.push(name)
      }
    }
  }
  return {
    groups: names.map(name => ({ name })),
    wires: wires.map(([sources, targets]) => ({ sources, targets })),
  }
}

// sideNames lists the names on each side of a layout.
function sideNames(layout) {
  return { left: layout.left.map(g => g.name), right: layout.right.map(g => g.name) }
}

test("a group goes on the side it holds in most wires", () => {
  const layout = layoutMap(mapOf([[["X"], ["Y"]], [["X"], ["Z"]], [["Y"], ["W"]]]))
  assert.deepEqual(sideNames(layout), { left: ["X"], right: ["Y", "Z", "W"] })
})

test("a tie follows the group's side in its first wire", () => {
  const layout = layoutMap(mapOf([[["P"], ["Q"]], [["Q"], ["P"]]]))
  assert.deepEqual(sideNames(layout), { left: ["P"], right: ["Q"] })
})

test("groups first named by the same wire sort by name", () => {
  const layout = layoutMap(mapOf([[["B", "A"], ["D", "C"]]]))
  assert.deepEqual(sideNames(layout), { left: ["A", "B"], right: ["C", "D"] })
})

test("a wire with an empty side lays out without throwing", () => {
  assert.deepEqual(sideNames(layoutMap(mapOf([[["A"], []]]))), { left: ["A"], right: [] })
})

test("thread weight grows with a wire's decks", () => {
  assert.equal(threadWeight(1, 24), 1.2)
  assert.equal(threadWeight(24, 24), 3.8)
  assert.equal(threadWeight(0, 0), 1.2)
  assert.equal(threadWeight(12, 24), 2.8)
})

test("the depth matrix places counts by side, with 5 meaning 5+", () => {
  const matrix = depthMatrix([{ a: 1, b: 2, count: 2 }, { a: 5, b: 5, count: 1 }])
  assert.equal(matrix.length, 6)
  assert.equal(matrix[1][2], 2)
  assert.equal(matrix[5][5], 1)
  assert.equal(matrix[0][0], 0)
})

test("a deck count reads in the singular for one deck", () => {
  assert.equal(decksText(1), "1 deck")
  assert.equal(decksText(0), "0 decks")
  assert.equal(decksText(24), "24 decks")
})
