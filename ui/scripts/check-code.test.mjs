import { test } from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { checkFiles } from "./check-code.mjs"

// fixture returns the path of one of this folder's fixture files.
function fixture(name) {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
}

test("reports nothing for a clean file", async () => {
  assert.deepEqual(await checkFiles([fixture("clean.js"), fixture("helpers.js")]), [])
})

test("reports a name used but never defined", async () => {
  const findings = await checkFiles([fixture("undefined-name.js")])
  assert.deepEqual(findings.map(f => f.kind), ["undefined-name", "undefined-name"])
  const text = findings.map(f => f.message).join(" ")
  assert.match(text, /Missing/)
  assert.match(text, /notDefined/)
})

test("reports an unused import", async () => {
  const findings = await checkFiles([fixture("unused-import.js")])
  assert.deepEqual(findings.map(f => f.kind), ["unused"])
})

test("reports a named import the target doesn't export", async () => {
  const findings = await checkFiles([fixture("missing-export.js")])
  assert.deepEqual(findings.map(f => f.kind), ["missing-export"])
  assert.match(findings[0].message, /nope/)
})

test("reports an import cycle", async () => {
  const findings = await checkFiles([fixture("cycle-a.js"), fixture("cycle-b.js")])
  assert.deepEqual(findings.map(f => f.kind), ["cycle"])
  assert.match(findings[0].message, /cycle-a\.js/)
  assert.match(findings[0].message, /cycle-b\.js/)
})

test("resolves an import without .js the way webpack does", async () => {
  assert.deepEqual(await checkFiles([fixture("extensionless.js")]), [])
})
