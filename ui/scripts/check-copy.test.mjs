import { test } from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { checkCopy } from "./check-copy.mjs"

// fixture returns the path of one of the copy checker's fixture files.
function fixture(name) {
  return fileURLToPath(new URL(`./fixtures/copy/${name}`, import.meta.url))
}

// findingsFor checks one fixture and returns its findings as { kind, text }.
async function findingsFor(name) {
  const findings = await checkCopy([fixture(name)])
  return findings.map(f => ({ kind: f.kind, text: f.text }))
}

test("reports JSX text", async () => {
  assert.deepEqual(await findingsFor("jsx-text.js"), [{ kind: "jsx-text", text: "Select a card to chart it." }])
})

test("ignores punctuation-only JSX text", async () => {
  assert.deepEqual(await findingsFor("punctuation.js"), [])
})

test("reports a text attribute", async () => {
  assert.deepEqual(await findingsFor("attribute.js"), [{ kind: "attribute", text: "Played by" }])
})

test("reports a label property", async () => {
  assert.deepEqual(await findingsFor("property.js"), [{ kind: "property", text: "Raw (cube)" }])
})

test("reports a sentence in a returned string", async () => {
  const findings = await findingsFor("sentence.js")
  assert.deepEqual(findings.map(f => f.kind), ["sentence"])
  assert.match(findings[0].text, /not distinguishable from 50%/)
})

test("skips class names, styles, URLs and COPY", async () => {
  assert.deepEqual(await findingsFor("skips.js"), [])
})

test("a copy-ok comment silences the next line", async () => {
  assert.deepEqual(await findingsFor("copy-ok.js"), [])
})

test("reports a COPY key that doesn't exist", async () => {
  const findings = await checkCopy([fixture("missing-key.js")])
  assert.deepEqual(findings.map(f => f.kind), ["missing-copy-key"])
  assert.equal(findings[0].text, "FIXTURE_COPY.table.wins")
  assert.equal(findings[0].line, 4)
})

test("a computed member isn't checked", async () => {
  assert.deepEqual(await findingsFor("computed.js"), [])
})
