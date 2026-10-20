import { test } from "node:test"
import assert from "node:assert/strict"
import { compareSnapshots } from "./text-snapshot.mjs"

// snapshotWith builds a one-route snapshot holding the given lines.
function snapshotWith(lines) {
  return { shots: null, routes: { cards: { lines, attrs: ["title=Played by"] } } }
}

test("identical snapshots compare clean", () => {
  const s = snapshotWith(["Cards", "# Games", "Win%"])
  assert.deepEqual(compareSnapshots(s, s, ["cards"]), [])
})

test("a changed line shows as missing and added", () => {
  const before = snapshotWith(["Cards", "# Games", "Win%"])
  const after = snapshotWith(["Cards", "#Games", "Win%"])
  assert.deepEqual(compareSnapshots(before, after, ["cards"]), [{ route: "cards", missing: ["# Games"], added: ["#Games"] }])
})
