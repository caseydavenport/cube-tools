import { test } from "node:test"
import assert from "node:assert/strict"
import { renameInLink, withExclude } from "./rulebookEdits.js"

test("withExclude drops an empty exclude list", () => {
  const group = withExclude({ name: "A", conditions: ["t:a"], exclude: ["x"] }, [])
  assert.equal("exclude" in group, false)
})

test("withExclude sets a non-empty exclude list", () => {
  assert.deepEqual(withExclude({ name: "A" }, ["x"]).exclude, ["x"])
})

test("renameInLink renames every wire end", () => {
  const link = { label: "L", wires: [{ sources: ["Old", "B"], targets: ["Old"] }] }
  assert.deepEqual(renameInLink(link, "Old", "New").wires, [{ sources: ["New", "B"], targets: ["New"] }])
})
