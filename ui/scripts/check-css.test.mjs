import { test } from "node:test"
import assert from "node:assert/strict"
import { bootstrapFindings, classNamesIn, colorFindings, staticStyleFindings, unusedClasses } from "./check-css.mjs"

test("reports a class no JavaScript names", () => {
  assert.deepEqual(unusedClasses(".a{} .b{}", new Set(["a"])), ["b"])
})

test("keeps a class named in a concatenation or template literal", () => {
  const names = classNamesIn('const a = "x " + (on ? "dm-on" : "")\nconst b = `deck-row-${kind}`')
  assert.deepEqual(unusedClasses(".dm-on{} .deck-row-mana{} .other{}", names), ["other"])
})

test("reports raw colors and honors color-ok", () => {
  const css = ["a { color: #abc }", "b { color: #a1b2c3 }", "c { color: rgba(0,0,0,.5) }", "d { color: rgb(1,2,3) }", "e { color: #fff } /* color-ok: data palette */"].join("\n")
  const found = colorFindings(css, "css-color")
  assert.deepEqual(found.map(f => f.line), [1, 2, 3, 4])
  assert.deepEqual(found.map(f => f.detail), ["#abc", "#a1b2c3", "rgba(0,0,0,.5)", "rgb(1,2,3)"])

  const js = ['const a = "#abc"', 'const b = "#fff" // color-ok: data palette', "// color-ok: scale", 'const c = "rgb(1, 2, 3)"'].join("\n")
  assert.deepEqual(colorFindings(js, "js-color").map(f => f.line), [1])
})

test("reports a style object of literals only", () => {
  const source = [
    'const a = <div style={{ margin: 4, color: "red" }} />',
    'const b = <div style={{ width: pct + "%" }} />',
    "// style-ok: depends on the browser",
    "const c = <div style={{ margin: 4 }} />",
  ].join("\n")
  assert.deepEqual(staticStyleFindings(source).map(f => f.line), [1])
})

test("reports a bootstrap import", () => {
  const source = 'import "bootstrap/dist/css/bootstrap.min.css"\nimport { Modal } from "react-bootstrap"\nimport x from "react"'
  assert.deepEqual(bootstrapFindings(source).map(f => f.line), [1, 2])
})

test("style-ok keeps an unused class", () => {
  const css = "/* style-ok: overrides Mantine's markup */\n.mantine-NavLink-body {}\n.gone {}"
  assert.deepEqual(unusedClasses(css, new Set()), ["gone"])
})
