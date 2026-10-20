import { test } from "node:test"
import assert from "node:assert/strict"
import { compareMoved, repoPath } from "./compare-moved.mjs"

const OLD = [{
  path: "old.js",
  text: `// a adds one.
function a(x) {
  return x + 1
}

// B is a constant.
export const B = 2
`,
}]

test("a pure move reports nothing changed", () => {
  const result = compareMoved(OLD, [
    { path: "one.js", text: "// a adds one.\nexport function a(x) {\n  return x + 1\n}\n" },
    { path: "two.js", text: "// B is a constant.\nconst B = 2\n" },
  ])
  assert.deepEqual(result, { changed: [], missing: [], added: [], duplicated: [] })
})

test("reports a declaration whose text changed", () => {
  const result = compareMoved(OLD, [
    { path: "one.js", text: "// a adds one.\nfunction a(x) {\n  return x + 2\n}\n// B is a constant.\nconst B = 2\n" },
  ])
  assert.deepEqual(result.changed, ["a"])
})

test("reports a declaration that went missing", () => {
  const result = compareMoved(OLD, [{ path: "one.js", text: "// B is a constant.\nconst B = 2\n" }])
  assert.deepEqual(result.missing, ["a"])
})

test("reports a new declaration as added", () => {
  const result = compareMoved(OLD, [
    { path: "one.js", text: "// a adds one.\nfunction a(x) {\n  return x + 1\n}\n// B is a constant.\nconst B = 2\nfunction c() {}\n" },
  ])
  assert.deepEqual(result.added, ["c"])
})

test("reports the same name declared in two new files", () => {
  const result = compareMoved(OLD, [
    { path: "one.js", text: "// a adds one.\nfunction a(x) {\n  return x + 1\n}\n// B is a constant.\nconst B = 2\n" },
    { path: "two.js", text: "// B is a constant.\nconst B = 2\n" },
  ])
  assert.deepEqual(result.duplicated, ["B"])
})

test("a file header above the first declaration isn't part of its comments", () => {
  const result = compareMoved(OLD, [
    { path: "one.js", text: "// One holds a.\n\n// a adds one.\nfunction a(x) {\n  return x + 1\n}\n// B is a constant.\nconst B = 2\n" },
  ])
  assert.deepEqual(result.changed, [])
})

test("paths are read from the repo root, wherever the script runs", () => {
  assert.equal(repoPath("ui/src/x.js", "/repo"), "ui/src/x.js")
  assert.equal(repoPath("/repo/ui/src/x.js", "/repo"), "ui/src/x.js")
})
