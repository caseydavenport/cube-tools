import {
  buildDeckSubgraph,
  rankByDegree,
  greedyModularityCommunities,
  dominantLabel,
} from "./DeckGraph"

// star: center A linked to B, C, D, plus an A-X edge that must be dropped
// because X is not in the card set.
const starEdges = () => [
  { source: "A", target: "B", weight: 2, rule_labels: ["L1"] },
  { source: "A", target: "C", weight: 1, rule_labels: ["L1", "L2"] },
  { source: "A", target: "D", weight: 1, rule_labels: ["L2"] },
  { source: "A", target: "X", weight: 5, rule_labels: ["L3"] },
]

// twoTriangles: cliques {A,B,C} and {D,E,F}, optionally bridged by one edge.
const twoTriangles = (bridge) => {
  const e = [
    { source: "A", target: "B", weight: 1, rule_labels: [] },
    { source: "A", target: "C", weight: 1, rule_labels: [] },
    { source: "B", target: "C", weight: 1, rule_labels: [] },
    { source: "D", target: "E", weight: 1, rule_labels: [] },
    { source: "D", target: "F", weight: 1, rule_labels: [] },
    { source: "E", target: "F", weight: 1, rule_labels: [] },
  ]
  if (bridge) e.push({ source: "C", target: "D", weight: 1, rule_labels: [] })
  return e
}

test("buildDeckSubgraph induces on the card set", () => {
  const g = buildDeckSubgraph(["A", "B", "C", "D"], starEdges())
  expect(g.nodes).toEqual(["A", "B", "C", "D"])
  expect(g.edges).toHaveLength(3)
  expect(g.adj["A"]["B"]).toBe(2)
  expect(g.adj["B"]["A"]).toBe(2)
  expect(g.adj["A"]["X"]).toBeUndefined()
})

test("buildDeckSubgraph keeps isolated nodes", () => {
  const g = buildDeckSubgraph(["A", "B", "Lonely"], starEdges())
  expect(g.nodes).toContain("Lonely")
  expect(Object.keys(g.adj["Lonely"])).toHaveLength(0)
})

test("rankByDegree tops the hub", () => {
  const g = buildDeckSubgraph(["A", "B", "C", "D"], starEdges())
  const ranked = rankByDegree(g)
  expect(ranked[0]).toMatchObject({ card: "A", weightedDegree: 4, degree: 3 })
})

test("greedy communities split bridged triangles", () => {
  const g = buildDeckSubgraph(["A", "B", "C", "D", "E", "F"], twoTriangles(true))
  const { communities, q } = greedyModularityCommunities(g)
  expect(communities).toHaveLength(2)
  expect(q).toBeGreaterThan(0)
  for (const c of communities) expect(c).toHaveLength(3)
})

test("greedy communities keep a single clique whole", () => {
  const g = buildDeckSubgraph(["A", "B", "C"], twoTriangles(false).slice(0, 3))
  const { communities } = greedyModularityCommunities(g)
  expect(communities).toHaveLength(1)
})

test("greedy modularity is zero without edges", () => {
  const g = buildDeckSubgraph(["A", "B"], [])
  const { q } = greedyModularityCommunities(g)
  expect(q).toBe(0)
})

test("dominantLabel picks the heaviest internal label", () => {
  const g = buildDeckSubgraph(["A", "B", "C"], [
    { source: "A", target: "B", weight: 3, rule_labels: ["Elves"] },
    { source: "A", target: "C", weight: 1, rule_labels: ["Tokens"] },
  ])
  expect(dominantLabel(g, ["A", "B"])).toBe("Elves")
  expect(dominantLabel(g, ["C"])).toBe("")
})
