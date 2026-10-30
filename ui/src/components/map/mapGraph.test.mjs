import { test } from "node:test"
import assert from "node:assert/strict"
import { buildMapGraph, findCommunities, groupCommunities, layoutMap } from "./mapGraph.js"

// node is a map node with only the fields the graph needs.
function node(id) {
  return { id, label: id, radius: 6, color: null }
}

// edge is a weight-1 map edge.
function edge(source, target, weight = 1) {
  return { source, target, weight }
}

// twoTriangles is {A,B,C} and {D,E,F}, joined by one C-D edge.
function twoTriangles() {
  const nodes = ["A", "B", "C", "D", "E", "F"].map(node)
  const edges = [
    edge("A", "B"), edge("A", "C"), edge("B", "C"),
    edge("D", "E"), edge("D", "F"), edge("E", "F"),
    edge("C", "D"),
  ]
  return { nodes, edges }
}

test("buildMapGraph drops edges to unknown nodes", () => {
  const graph = buildMapGraph([node("A"), node("B")], [edge("A", "B"), edge("A", "X")])
  assert.equal(graph.order, 2)
  assert.equal(graph.size, 1)
})

test("buildMapGraph sums a repeated pair", () => {
  const graph = buildMapGraph([node("A"), node("B")], [edge("A", "B", 2), edge("B", "A", 1)])
  assert.equal(graph.size, 1)
  assert.equal(graph.getEdgeAttribute(graph.edge("A", "B"), "weight"), 3)
})

test("buildMapGraph sizes nodes by radius", () => {
  const graph = buildMapGraph([{ ...node("A"), radius: 9 }], [])
  assert.equal(graph.getNodeAttribute("A", "size"), 9)
})

test("layoutMap is the same on every run", () => {
  const { nodes, edges } = twoTriangles()
  const first = buildMapGraph(nodes, edges)
  const second = buildMapGraph(nodes, edges)
  layoutMap(first)
  layoutMap(second)
  first.forEachNode((id, attrs) => {
    assert.ok(Number.isFinite(attrs.x) && Number.isFinite(attrs.y), id)
    assert.equal(attrs.x, second.getNodeAttribute(id, "x"))
    assert.equal(attrs.y, second.getNodeAttribute(id, "y"))
  })
})

test("layoutMap ignores the order nodes and edges arrive in", () => {
  const { nodes, edges } = twoTriangles()
  const forward = buildMapGraph(nodes, edges)
  const reversed = buildMapGraph([...nodes].reverse(), [...edges].reverse())
  layoutMap(forward)
  layoutMap(reversed)
  forward.forEachNode((id, attrs) => {
    assert.equal(attrs.x, reversed.getNodeAttribute(id, "x"), id)
    assert.equal(attrs.y, reversed.getNodeAttribute(id, "y"), id)
  })
})

test("layoutMap keeps an unlinked node near the cluster", () => {
  const { nodes, edges } = twoTriangles()
  const graph = buildMapGraph([...nodes, node("Z")], edges)
  layoutMap(graph)

  const linked = nodes.map(n => graph.getNodeAttributes(n.id))
  const cx = linked.reduce((sum, p) => sum + p.x, 0) / linked.length
  const cy = linked.reduce((sum, p) => sum + p.y, 0) / linked.length
  const spread = Math.max(...linked.map(p => Math.hypot(p.x - cx, p.y - cy)))
  const z = graph.getNodeAttributes("Z")
  assert.ok(Math.hypot(z.x - cx, z.y - cy) <= 2 * spread, `Z is ${Math.hypot(z.x - cx, z.y - cy)} away, spread ${spread}`)
})

test("findCommunities splits two bridged triangles", () => {
  const { nodes, edges } = twoTriangles()
  const communityOf = findCommunities(buildMapGraph(nodes, edges))
  assert.equal(communityOf.A, communityOf.B)
  assert.equal(communityOf.A, communityOf.C)
  assert.equal(communityOf.D, communityOf.E)
  assert.equal(communityOf.D, communityOf.F)
  assert.notEqual(communityOf.A, communityOf.D)
  assert.deepEqual(findCommunities(buildMapGraph(nodes, edges)), communityOf)
})

test("findCommunities gives each node of an edgeless graph its own community", () => {
  const graph = buildMapGraph([node("A"), node("B")], [])
  const communityOf = findCommunities(graph)
  assert.notEqual(communityOf.A, communityOf.B)
  layoutMap(graph)
  graph.forEachNode((id, attrs) => {
    assert.ok(Number.isFinite(attrs.x) && Number.isFinite(attrs.y), id)
  })
})

test("groupCommunities orders largest first", () => {
  const groups = groupCommunities({ A: 0, B: 0, C: 1, D: 0, E: 1, F: 2 })
  assert.deepEqual(groups, [["A", "B", "D"], ["C", "E"], ["F"]])
})

test("groupCommunities breaks size ties by smallest member", () => {
  const groups = groupCommunities({ Q: 0, R: 0, B: 1, C: 1 })
  assert.deepEqual(groups, [["B", "C"], ["Q", "R"]])
})
