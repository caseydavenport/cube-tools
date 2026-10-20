// check-copy finds UI text written inline in page code instead of in a COPY
// object, and COPY reads whose key doesn't exist. React renders a missing key
// as nothing, so a typo would silently blank a header.
//
// Run it from anywhere: `node ui/scripts/check-copy.mjs [files…]`. With no
// files it checks the pages whose text is moving into COPY. It prints
// `file:line kind text` per finding and exits 1 if it finds anything.

import { createRequire } from "node:module"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(path.join(UI_DIR, "package.json"))
const babelParser = require("@babel/parser")

// IN_SCOPE lists the folders and files the CLI checks when given no files.
const IN_SCOPE = [
  "src/stats/cards",
  "src/stats/colors",
  "src/pages/Health.js",
  "src/pages/Players.js",
  "src/pages/Stats.js",
  "src/stats/archetypes",
  "src/stats/deckstats",
  "src/stats/synergy",
  "src/pages/ExplorePage.js",
  "src/pages/RemovalPage.js",
  "src/pages/Packages.js",
  "src/components/PredicateBuilder.js",
  "src/design/map",
  "src/design/rules",
]

// JSX attributes and object properties whose string value is shown to people.
const TEXT_ATTRIBUTES = new Set(["title", "label", "placeholder", "aria-label", "alt", "description", "tip", "header", "text"])
const TEXT_PROPERTIES = new Set(["text", "label", "title", "tip", "header", "description", "placeholder", "tooltip"])

// Attributes and properties whose values are never UI text, such as
// rel="noopener noreferrer" on a link.
const SKIPPED_NAMES = new Set(["className", "style", "key", "id", "rel"])

// HAS_LETTER matches any letter, including Greek ones like Δ.
const HAS_LETTER = /\p{L}/u

// SENTENCE matches two words in a row, the sign of a phrase meant for people.
const SENTENCE = /[A-Za-z]{3,}\s+[A-Za-z]{2,}/

// Node fields the walker doesn't descend into: positions and comments.
const NON_CHILD_KEYS = new Set(["loc", "start", "end", "range", "extra", "leadingComments", "trailingComments", "innerComments"])

// OPEN_KEYS marks a statically read COPY object that has a spread in it, so
// any key might exist and the checker stops walking.
const OPEN_KEYS = Symbol("open")

// checkCopy checks the given files and returns every finding as
// { file, line, kind, text }, sorted by file and line. Kinds are "jsx-text",
// "attribute", "property", "sentence", "missing-copy-key", and "parse" for a
// file that doesn't parse. copy.js and test files are skipped.
export async function checkCopy(paths) {
  const files = paths.map(p => path.resolve(p)).filter(isCheckedFile)
  const findings = []
  for (const file of files) {
    findings.push(...await checkFile(file))
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file < b.file ? -1 : 1
    }
    return a.line - b.line
  })
  return findings
}

// isCheckedFile reports whether a file holds page code: copy.js files are
// where the text belongs, and tests are never shown to people.
function isCheckedFile(file) {
  const name = path.basename(file)
  if (name === "copy.js") {
    return false
  }
  if (name.includes(".test.")) {
    return false
  }
  return true
}

// checkFile parses one file and returns its findings, unsorted.
async function checkFile(file) {
  const source = readFileSync(file, "utf8")
  let ast
  try {
    ast = babelParser.parse(source, { sourceType: "module", plugins: ["jsx"] })
  } catch (err) {
    return [{ file, line: err.loc ? err.loc.line : 0, kind: "parse", text: err.message }]
  }

  const silenced = silencedLines(ast.comments)
  const copyObjects = await copyObjectsFor(file, ast.program)
  const findings = []

  // report adds a finding unless a copy-ok comment sits on the line above.
  function report(line, kind, text) {
    if (!silenced.has(line)) {
      findings.push({ file, line, kind, text })
    }
  }

  walk(ast.program, source, copyObjects, report)
  return findings
}

// silencedLines returns the lines directly under a `// copy-ok: <reason>`
// comment, where findings are not reported.
function silencedLines(comments) {
  const lines = new Set()
  for (const comment of comments) {
    if (comment.value.trim().startsWith("copy-ok:")) {
      lines.add(comment.loc.end.line + 1)
    }
  }
  return lines
}

// copyObjectsFor returns a map from a name to the COPY object it holds: each
// name imported from a copy.js, loaded with import(), and the file's own
// `const COPY = {…}`, read from the code without running it.
async function copyObjectsFor(file, program) {
  const objects = new Map()
  for (const node of program.body) {
    if (node.type === "ImportDeclaration" && isCopyImport(node.source.value)) {
      const target = resolveImport(file, node.source.value)
      if (!existsSync(target)) {
        continue
      }
      const loaded = await import(pathToFileURL(target).href)
      for (const spec of node.specifiers) {
        if (spec.type === "ImportSpecifier") {
          objects.set(spec.local.name, loaded[spec.imported.name || spec.imported.value])
        }
      }
    }

    const ownCopy = ownCopyInitializer(node)
    if (ownCopy !== null) {
      objects.set("COPY", staticKeys(ownCopy))
    }
  }
  return objects
}

// isCopyImport reports whether an import source names a copy.js file.
function isCopyImport(source) {
  if (!source.startsWith(".")) {
    return false
  }
  const name = path.basename(source)
  return name === "copy" || name === "copy.js"
}

// resolveImport finds the file a relative import names, as written or with
// .js added, the way webpack does.
function resolveImport(file, source) {
  const base = path.resolve(path.dirname(file), source)
  if (existsSync(base) && statSync(base).isFile()) {
    return base
  }
  return base + ".js"
}

// ownCopyInitializer returns the object literal of a top-level
// `const COPY = {…}` (exported or not), or null when the node isn't one.
function ownCopyInitializer(node) {
  let declaration = node
  if (node.type === "ExportNamedDeclaration") {
    declaration = node.declaration
  }
  if (!declaration || declaration.type !== "VariableDeclaration") {
    return null
  }
  for (const d of declaration.declarations) {
    if (isCopyDeclarator(d) && d.init.type === "ObjectExpression") {
      return d.init
    }
  }
  return null
}

// isCopyDeclarator reports whether a declarator is `COPY = <something>`.
function isCopyDeclarator(node) {
  return node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name === "COPY" && node.init
}

// staticKeys turns an object literal into a plain object with the same keys,
// so a COPY read can be walked. Nested object literals are kept; any other
// value becomes true. A spread marks the object open.
function staticKeys(objectNode) {
  const keys = {}
  for (const prop of objectNode.properties) {
    if (prop.type === "SpreadElement" || prop.computed) {
      keys[OPEN_KEYS] = true
      continue
    }
    const name = prop.key.name || prop.key.value
    if (prop.type === "ObjectProperty" && prop.value.type === "ObjectExpression") {
      keys[name] = staticKeys(prop.value)
    } else {
      keys[name] = true
    }
  }
  return keys
}

// walk visits a node and its children, reporting inline text and COPY reads.
// It doesn't descend into the parts the checker skips.
function walk(node, source, copyObjects, report) {
  if (shouldSkip(node)) {
    return
  }
  if (checkNode(node, source, copyObjects, report)) {
    return
  }

  const skippedKeys = skippedChildKeys(node)
  for (const key of Object.keys(node)) {
    if (NON_CHILD_KEYS.has(key) || skippedKeys.includes(key)) {
      continue
    }
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === "string") {
          walk(child, source, copyObjects, report)
        }
      }
    } else if (value && typeof value.type === "string") {
      walk(value, source, copyObjects, report)
    }
  }
}

// skippedChildKeys names the children of a node that walk leaves out: an
// object property's plain key, and the source string of an export.
function skippedChildKeys(node) {
  if (node.type === "ObjectProperty" && !node.computed) {
    return ["key"]
  }
  if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
    return ["source"]
  }
  return []
}

// shouldSkip reports whether a node holds nothing the checker looks at:
// imports, export sources, the COPY initializer, console messages, and
// attributes or properties such as className and style.
function shouldSkip(node) {
  if (node.type === "ImportDeclaration") {
    return true
  }
  if (node.type === "VariableDeclarator" && isCopyDeclarator(node)) {
    return true
  }
  if (node.type === "JSXAttribute" && SKIPPED_NAMES.has(jsxAttributeName(node))) {
    return true
  }
  if (node.type === "ObjectProperty" && SKIPPED_NAMES.has(propertyName(node))) {
    return true
  }
  if (node.type === "CallExpression" && isConsoleOrImport(node.callee)) {
    return true
  }
  return false
}

// isConsoleOrImport reports whether a call is `console.x(…)` or `import(…)`.
function isConsoleOrImport(callee) {
  if (callee.type === "Import") {
    return true
  }
  return callee.type === "MemberExpression" && callee.object.type === "Identifier" && callee.object.name === "console"
}

// checkNode reports a finding for a node that is text or a COPY read, and
// returns true when its children need no further visit.
function checkNode(node, source, copyObjects, report) {
  if (node.type === "JSXText") {
    checkJsxText(node, report)
    return true
  }

  if (node.type === "JSXAttribute" && TEXT_ATTRIBUTES.has(jsxAttributeName(node))) {
    return reportTextValue(jsxAttributeValue(node), "attribute", source, report)
  }

  if (node.type === "ObjectProperty" && TEXT_PROPERTIES.has(propertyName(node))) {
    return reportTextValue(node.value, "property", source, report)
  }

  if (node.type === "StringLiteral") {
    if (SENTENCE.test(node.value)) {
      report(node.loc.start.line, "sentence", node.value)
    }
    return true
  }

  if (node.type === "TemplateLiteral") {
    if (node.quasis.some(q => SENTENCE.test(q.value.cooked || ""))) {
      report(node.loc.start.line, "sentence", templateText(node, source))
    }
    // The ${…} parts may hold strings or COPY reads of their own.
    for (const expr of node.expressions) {
      walk(expr, source, copyObjects, report)
    }
    return true
  }

  if (node.type === "MemberExpression" && isCopyRoot(node, copyObjects)) {
    checkCopyChain(node, copyObjects, report)
    walkComputedMembers(node, source, copyObjects, report)
    return true
  }

  return false
}

// checkJsxText reports JSX text that has a letter in it, at the line where
// its first non-space character is.
function checkJsxText(node, report) {
  const text = node.value.trim()
  if (!HAS_LETTER.test(text)) {
    return
  }
  const leading = node.value.slice(0, node.value.indexOf(text))
  const newlines = leading.split("\n").length - 1
  report(node.loc.start.line + newlines, "jsx-text", text)
}

// reportTextValue reports a text attribute or property whose value is a
// string or template with a letter in its fixed parts. It returns true when
// the value was reported, so walk doesn't report it again as a sentence.
function reportTextValue(value, kind, source, report) {
  if (!value) {
    return false
  }
  if (value.type === "StringLiteral" && HAS_LETTER.test(value.value)) {
    report(value.loc.start.line, kind, value.value)
    return true
  }
  if (value.type === "TemplateLiteral" && value.quasis.some(q => HAS_LETTER.test(q.value.cooked || ""))) {
    report(value.loc.start.line, kind, templateText(value, source))
    return true
  }
  return false
}

// jsxAttributeName returns an attribute's name, such as "aria-label".
function jsxAttributeName(node) {
  if (node.name.type === "JSXIdentifier") {
    return node.name.name
  }
  return ""
}

// jsxAttributeValue returns the expression an attribute holds: the string in
// title="…" or the expression in title={…}.
function jsxAttributeValue(node) {
  if (node.value && node.value.type === "JSXExpressionContainer") {
    return node.value.expression
  }
  return node.value
}

// propertyName returns an object property's name, or "" for a computed key.
function propertyName(node) {
  if (node.computed) {
    return ""
  }
  return node.key.name || node.key.value || ""
}

// templateText returns a template literal's source without the backticks.
function templateText(node, source) {
  return source.slice(node.start + 1, node.end - 1)
}

// isCopyRoot reports whether a member read, followed down to its first name,
// starts at a COPY object, as `CARDS_COPY.columns.win` does.
function isCopyRoot(node, copyObjects) {
  let root = node
  while (root.type === "MemberExpression") {
    root = root.object
  }
  return root.type === "Identifier" && copyObjects.has(root.name)
}

// checkCopyChain walks a read like `CARDS_COPY.columns.win` through its COPY
// object and reports the first key that doesn't exist. It stops at a computed
// member, a function, or a value that isn't an object.
function checkCopyChain(node, copyObjects, report) {
  const members = []
  let current = node
  while (current.type === "MemberExpression") {
    members.unshift(current)
    current = current.object
  }

  let value = copyObjects.get(current.name)
  let chain = current.name
  for (const member of members) {
    if (member.computed) {
      return
    }
    if (value === null || typeof value !== "object" || value[OPEN_KEYS]) {
      return
    }
    chain += "." + member.property.name
    if (!(member.property.name in value)) {
      report(member.loc.start.line, "missing-copy-key", chain)
      return
    }
    value = value[member.property.name]
  }
}

// walkComputedMembers visits the expressions inside a COPY read's brackets,
// such as `view` in `COPY.titles[view]`, which may hold text of their own.
function walkComputedMembers(node, source, copyObjects, report) {
  let current = node
  while (current.type === "MemberExpression") {
    if (current.computed) {
      walk(current.property, source, copyObjects, report)
    }
    current = current.object
  }
}

// inScopeFiles lists the .js files the CLI checks with no arguments.
function inScopeFiles() {
  const files = []
  for (const entry of IN_SCOPE) {
    const full = path.join(UI_DIR, entry)
    if (statSync(full).isDirectory()) {
      files.push(...jsFilesUnder(full))
    } else {
      files.push(full)
    }
  }
  return files
}

// jsFilesUnder lists every .js file below a folder.
function jsFilesUnder(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...jsFilesUnder(full))
    } else if (name.endsWith(".js")) {
      files.push(full)
    }
  }
  return files
}

// main checks the files named on the command line, or the in-scope pages.
async function main() {
  let files = process.argv.slice(2)
  if (files.length === 0) {
    files = inScopeFiles()
  }

  const findings = await checkCopy(files)
  for (const f of findings) {
    const text = f.text.replace(/\n/g, "\\n")
    console.log(`${path.relative(process.cwd(), f.file)}:${f.line} ${f.kind} ${text}`)
  }
  console.log(`${findings.length} finding(s) in ${files.length} file(s)`)
  if (findings.length > 0) {
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
