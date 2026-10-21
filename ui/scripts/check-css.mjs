// check-css finds styling left over from before the theme: CSS classes no
// JavaScript names, Bootstrap imports, raw colors, and inline styles made only
// of literal values.
//
// Run it from anywhere: `node ui/scripts/check-css.mjs [--only kind,kind] [files…]`.
// With no files it checks every .js and .css file under ui/src. It prints
// `file:line kind detail` per finding and exits 1 if it finds anything.

import { createRequire } from "node:module"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SRC_DIR = path.join(UI_DIR, "src")
const require = createRequire(path.join(UI_DIR, "package.json"))
const babelParser = require("@babel/parser")

// KINDS lists every finding kind, in the order the CLI documents them.
const KINDS = ["unused-class", "bootstrap", "css-color", "js-color", "static-style"]

// IMPORT_FILES are the import flow's files. They're skipped for js-color and
// static-style because the queued "Import pages on the kit" plan rewrites them.
const IMPORT_FILES = [
  "src/pages/ImportHub.js",
  "src/pages/ImportWizard.js",
  "src/pages/ImportReview.js",
  "src/pages/HedronImport.js",
  "src/pages/PhotoImport.js",
  "src/pages/PhotoViewer.js",
  "src/pages/OCRImport.js",
  "src/pages/PoolList.js",
  "src/pages/PlayerWorkspace.js",
  "src/utils/OCRStatus.js",
]

// The comment that skips each kind of finding: `// style-ok: <reason>`.
const SKIP_TAG = {
  "unused-class": "style-ok",
  "static-style": "style-ok",
  "css-color": "color-ok",
  "js-color": "color-ok",
}

// COLOR matches a 3, 4, 6 or 8 digit hex color, or an rgb( / rgba( call.
const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\brgba?\(\s*[^)]*\)/g

// parseJs parses JavaScript with JSX, or returns null when it doesn't parse.
function parseJs(source) {
  try {
    return babelParser.parse(source, { sourceType: "module", plugins: ["jsx"] }).program
  } catch {
    return null
  }
}

// forEachNode calls visit on the node and every node below it.
function forEachNode(node, visit) {
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") {
      continue
    }
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === "string") {
          forEachNode(child, visit)
        }
      }
    } else if (value && typeof value.type === "string") {
      forEachNode(value, visit)
    }
  }
}

// isSkipped says whether a finding on a 1-based line carries the skip comment
// for its kind, on its own line or on the line above.
function isSkipped(lines, line, kind) {
  const marker = SKIP_TAG[kind] + ":"
  if (lines[line - 1] !== undefined && lines[line - 1].includes(marker)) {
    return true
  }
  return lines[line - 2] !== undefined && lines[line - 2].includes(marker)
}

// withoutSkipped drops the findings whose line carries the skip comment.
function withoutSkipped(source, kind, findings) {
  const lines = source.split("\n")
  return findings.filter(f => !isSkipped(lines, f.line, kind))
}

// classNamesIn returns the class names a JavaScript file might use: every
// whitespace-separated token of its string literals, plus the literal text
// before each `${` in a template literal, which ends in "-" or "_" when it is
// the front of a name built at runtime. isNamed treats those as prefixes.
export function classNamesIn(jsSource) {
  const names = new Set()
  const program = parseJs(jsSource)
  if (program === null) {
    return names
  }
  forEachNode(program, node => {
    if (node.type === "StringLiteral" || node.type === "JSXText") {
      addTokens(names, node.value)
    } else if (node.type === "TemplateLiteral") {
      for (const quasi of node.quasis) {
        addTokens(names, quasi.value.cooked || "")
      }
    }
  })
  return names
}

// addTokens adds each whitespace-separated token of text to names.
function addTokens(names, text) {
  for (const token of text.split(/\s+/)) {
    if (token !== "") {
      names.add(token)
    }
  }
}

// isNamed says whether a class is used: some JavaScript string names it, or
// names a prefix of it (a name ending in "-" or "_").
function isNamed(name, names) {
  if (names.has(name)) {
    return true
  }
  for (const known of names) {
    const looksLikePrefix = known.endsWith("-") || known.endsWith("_")
    if (looksLikePrefix && name.startsWith(known)) {
      return true
    }
  }
  return false
}

// blankOut replaces every character but newlines with a space, so text can be
// hidden from a scan without moving the line numbers.
function blankOut(text) {
  return text.replace(/[^\n]/g, " ")
}

// withoutComments blanks out a stylesheet's comments.
function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, blankOut)
}

// blankComments blanks out a stylesheet's comments and string contents, so
// later scans see only code.
function blankComments(css) {
  return withoutComments(css).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, blankOut)
}

// selectorClasses lists each class selector in a stylesheet as { name, line },
// reading only selectors and never declaration blocks.
function selectorClasses(css) {
  const code = blankComments(css)
  const found = []
  const stack = []
  let preludeStart = 0
  let line = 1
  let preludeLine = 1

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === "\n") {
      line++
    }
    if (ch === "{") {
      const prelude = code.slice(preludeStart, i).trim()
      const isGroup = prelude.startsWith("@") && !/^@(-webkit-)?(keyframes|font-face)/.test(prelude)
      if (isGroup) {
        stack.push("group")
      } else {
        if (!stack.includes("rule") && !prelude.startsWith("@")) {
          addClasses(found, code.slice(preludeStart, i), preludeLine)
        }
        stack.push("rule")
      }
      preludeStart = i + 1
      preludeLine = line
    } else if (ch === "}" || ch === ";") {
      if (ch === "}") {
        stack.pop()
      }
      preludeStart = i + 1
      preludeLine = line
    }
  }
  return found
}

// addClasses appends the class selectors in one rule's selector text. A rule's
// text may start on a blank line, so each class takes its own line.
function addClasses(found, prelude, startLine) {
  const leading = prelude.length - prelude.trimStart().length
  let line = startLine + (prelude.slice(0, leading).match(/\n/g) || []).length
  const text = prelude.trimStart()
  const pattern = /\n|\.(-?[_a-zA-Z][\w-]*)/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match[0] === "\n") {
      line++
    } else {
      found.push({ name: match[1], line })
    }
  }
}

// unusedClassFindings returns { line, detail } for each class selector in the
// stylesheet that `names` doesn't cover, once per class name.
export function unusedClassFindings(cssText, names) {
  const seen = new Set()
  const findings = []
  const kept = withoutSkipped(cssText, "unused-class", selectorClasses(cssText))
  for (const { name, line } of kept) {
    if (!isNamed(name, names) && !seen.has(name)) {
      seen.add(name)
      findings.push({ line, detail: name })
    }
  }
  return findings
}

// unusedClasses returns the names of the classes in the stylesheet that no
// JavaScript string names. A `style-ok:` comment keeps a class.
export function unusedClasses(cssText, names) {
  return unusedClassFindings(cssText, names).map(f => f.detail)
}

// colorFindings returns { line, detail } for each hex, rgb() or rgba() color
// in the text, skipping those with a `color-ok:` comment. kind "css-color"
// reads a stylesheet, outside its comments. kind "js-color" reads JavaScript,
// in its string and template literals only.
export function colorFindings(text, kind) {
  let found
  if (kind === "js-color") {
    found = jsColors(text)
  } else {
    found = cssColors(text)
  }
  return withoutSkipped(text, kind, found)
}

// cssColors finds the colors in a stylesheet's code, not its comments.
function cssColors(css) {
  const code = withoutComments(css)
  const found = []
  const lines = code.split("\n")
  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(COLOR)) {
      found.push({ line: i + 1, detail: match[0] })
    }
  }
  return found
}

// jsColors finds the colors written inside string and template literals.
function jsColors(source) {
  const found = []
  const program = parseJs(source)
  if (program === null) {
    return found
  }
  forEachNode(program, node => {
    let value = null
    if (node.type === "StringLiteral") {
      value = node.value
    } else if (node.type === "TemplateElement") {
      value = node.value.raw
    }
    if (value === null) {
      return
    }
    for (const match of value.matchAll(COLOR)) {
      found.push({ line: node.loc.start.line, detail: match[0] })
    }
  })
  return found
}

// isBootstrap says whether a module name is Bootstrap or one of its files.
function isBootstrap(name) {
  return /^~?(react-)?bootstrap(\/|$)/.test(name)
}

// bootstrapFindings returns { line, detail } for each import or require of
// `bootstrap` or `react-bootstrap` in JavaScript, or @import in CSS.
export function bootstrapFindings(source) {
  const found = []
  const program = parseJs(source)
  if (program === null) {
    const pattern = /(?:import|@import|require)[^\n]*["']([^"']+)["']/g
    for (const match of source.matchAll(pattern)) {
      if (isBootstrap(match[1])) {
        found.push({ line: source.slice(0, match.index).split("\n").length, detail: match[1] })
      }
    }
    return found
  }
  forEachNode(program, node => {
    if (node.type === "ImportDeclaration" && isBootstrap(node.source.value)) {
      found.push({ line: node.loc.start.line, detail: node.source.value })
    }
    if (node.type === "CallExpression" && node.callee.name === "require" && node.arguments[0]) {
      if (node.arguments[0].type === "StringLiteral" && isBootstrap(node.arguments[0].value)) {
        found.push({ line: node.loc.start.line, detail: node.arguments[0].value })
      }
    }
  })
  return found
}

// isLiteral says whether an expression is a plain value: a string, number,
// boolean, null, a template with nothing in it, or a negative number.
function isLiteral(node) {
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral", "NullLiteral"].includes(node.type)) {
    return true
  }
  if (node.type === "TemplateLiteral") {
    return node.expressions.length === 0
  }
  return node.type === "UnaryExpression" && isLiteral(node.argument)
}

// isLiteralObject says whether an object expression has properties and every
// value is a literal.
function isLiteralObject(node) {
  if (node.type !== "ObjectExpression" || node.properties.length === 0) {
    return false
  }
  return node.properties.every(prop => prop.type === "ObjectProperty" && !prop.computed && isLiteral(prop.value))
}

// staticStyleFindings returns { line, detail } for each `style={{…}}` in the
// JSX whose values are all literals, skipping those with a `style-ok:` comment.
export function staticStyleFindings(jsSource) {
  const found = []
  const program = parseJs(jsSource)
  if (program === null) {
    return found
  }
  forEachNode(program, node => {
    if (node.type !== "JSXAttribute" || node.name.name !== "style" || !node.value) {
      return
    }
    const expression = node.value.expression
    if (node.value.type === "JSXExpressionContainer" && expression && isLiteralObject(expression)) {
      const text = jsSource.slice(node.start, node.end).replace(/\s+/g, " ")
      found.push({ line: node.loc.start.line, detail: text })
    }
  })
  return withoutSkipped(jsSource, "static-style", found)
}

// filesUnder lists every .js and .css file below a folder, leaving out the old
// Jest tests (*.test.js).
function filesUnder(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...filesUnder(full))
    } else if ((name.endsWith(".js") && !name.endsWith(".test.js")) || name.endsWith(".css")) {
      files.push(full)
    }
  }
  return files
}

// isImportFile says whether a file belongs to the import flow.
function isImportFile(file) {
  const relative = path.relative(UI_DIR, file)
  return IMPORT_FILES.includes(relative)
}

// isThemeFile says whether a file is under ui/src/theme/, where raw colors live.
function isThemeFile(file) {
  return !path.relative(path.join(SRC_DIR, "theme"), file).startsWith("..")
}

// allClassNames collects the class names every JavaScript file under src uses.
function allClassNames() {
  const names = new Set()
  for (const file of filesUnder(SRC_DIR)) {
    if (file.endsWith(".js")) {
      const source = readFileSync(file, "utf8")
      if (parseJs(source) === null) {
        console.error(`${path.relative(process.cwd(), file)}: does not parse, so its class names are not counted`)
      }
      for (const name of classNamesIn(source)) {
        names.add(name)
      }
    }
  }
  return names
}

// checkFiles returns every finding in the files as { file, line, kind, detail },
// limited to the kinds in `only`, sorted by file and line.
export function checkFiles(files, only) {
  const wanted = kind => only.includes(kind)
  const names = wanted("unused-class") ? allClassNames() : new Set()
  const findings = []

  for (const file of files) {
    const source = readFileSync(file, "utf8")
    const isCss = file.endsWith(".css")
    const add = (kind, list) => {
      for (const item of list) {
        findings.push({ file, line: item.line, kind, detail: item.detail })
      }
    }

    if (wanted("bootstrap")) {
      add("bootstrap", bootstrapFindings(source))
    }
    if (isCss && wanted("unused-class")) {
      add("unused-class", unusedClassFindings(source, names))
    }
    if (isThemeFile(file)) {
      continue
    }
    if (isCss && wanted("css-color")) {
      add("css-color", colorFindings(source, "css-color"))
    }
    if (!isCss && !isImportFile(file)) {
      if (wanted("js-color")) {
        add("js-color", colorFindings(source, "js-color"))
      }
      if (wanted("static-style")) {
        add("static-style", staticStyleFindings(source))
      }
    }
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file < b.file ? -1 : 1
    }
    return a.line - b.line
  })
  return findings
}

// main checks the files named on the command line, or all of ui/src.
function main() {
  const args = process.argv.slice(2)
  let only = KINDS
  const onlyAt = args.indexOf("--only")
  if (onlyAt !== -1) {
    only = args[onlyAt + 1].split(",")
    args.splice(onlyAt, 2)
    for (const kind of only) {
      if (!KINDS.includes(kind)) {
        console.error(`unknown kind ${kind}; kinds are ${KINDS.join(", ")}`)
        process.exit(2)
      }
    }
  }

  let files = args.map(p => path.resolve(p))
  if (files.length === 0) {
    files = filesUnder(SRC_DIR)
  }

  const findings = checkFiles(files, only)
  for (const f of findings) {
    console.log(`${path.relative(process.cwd(), f.file)}:${f.line} ${f.kind} ${f.detail}`)
  }
  console.log(`${findings.length} finding(s) in ${files.length} file(s)`)
  if (findings.length > 0) {
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
