// check-code finds mistakes that webpack builds without complaint and that only
// fail in the browser: names used but never defined or imported, unused
// imports and variables, imports of names a file doesn't export, imports of
// files that don't exist, and import cycles.
//
// Run it from anywhere: `node ui/scripts/check-code.mjs [files…]`. With no
// files it checks every .js file under ui/src. It exits 1 if it finds anything.

import { createRequire } from "node:module"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(path.join(UI_DIR, "package.json"))
const { ESLint } = require("eslint")
const babelParser = require("@babel/parser")

// The ESLint rules that catch names the code needs but doesn't have, and
// imports it has but doesn't need. The react rules make JSX tags count as uses.
const RULES = {
  "no-undef": "error",
  "react/jsx-no-undef": "error",
  "react/jsx-uses-vars": "error",
  "react/jsx-uses-react": "error",
  // Unused names in array destructuring are allowed: `for (const [name, card] of
  // map)` reads better than `[, card]`.
  "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true, destructuredArrayIgnorePattern: "^" }],
}

// RULE_KINDS maps an ESLint rule to the kind of finding it reports.
const RULE_KINDS = {
  "no-undef": "undefined-name",
  "react/jsx-no-undef": "undefined-name",
  "no-unused-vars": "unused",
}

// checkFiles checks the given files and returns every finding as
// { file, line, kind, message }, sorted by file and line. Kinds are
// "undefined-name", "unused", "missing-export", "missing-file", "cycle", and
// "parse" for a file that doesn't parse.
export async function checkFiles(paths) {
  const files = paths.map(p => path.resolve(p))
  const findings = [...await lintFindings(files), ...importFindings(files)]

  findings.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file < b.file ? -1 : 1
    }
    return a.line - b.line
  })
  return findings
}

// lintFindings runs ESLint with RULES over the files.
async function lintFindings(files) {
  const eslint = new ESLint({
    cwd: UI_DIR,
    useEslintrc: false,
    resolvePluginsRelativeTo: UI_DIR,
    overrideConfig: {
      parser: require.resolve("@babel/eslint-parser"),
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        requireConfigFile: false,
        babelOptions: { presets: [require.resolve("@babel/preset-react")] },
      },
      env: { browser: true, es2022: true },
      // webpack fills in process.env at build time.
      globals: { process: "readonly" },
      plugins: ["react"],
      settings: { react: { version: "19" } },
      rules: RULES,
    },
  })

  const results = await eslint.lintFiles(files)
  const findings = []
  for (const result of results) {
    for (const msg of result.messages) {
      let kind = RULE_KINDS[msg.ruleId]
      if (msg.fatal) {
        kind = "parse"
      }
      if (kind === undefined) {
        continue
      }
      findings.push({ file: result.filePath, line: msg.line || 0, kind, message: msg.message })
    }
  }
  return findings
}

// parseModule reads a file and returns its parsed program, or null when it
// doesn't parse (ESLint already reports that).
function parseModule(file) {
  try {
    const text = readFileSync(file, "utf8")
    return babelParser.parse(text, { sourceType: "module", plugins: ["jsx"] }).program
  } catch {
    return null
  }
}

// relativeImports lists a module's imports of other local files, as
// { source, target, line, names }. names holds the imported names, with
// "default" for a default import; a namespace import (`* as x`) has none.
function relativeImports(file, program) {
  const imports = []
  for (const node of program.body) {
    const isImport = node.type === "ImportDeclaration"
    const isReexport = (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source
    if (!isImport && !isReexport) {
      continue
    }

    const source = node.source.value
    if (!source.startsWith(".")) {
      continue
    }

    const names = []
    for (const spec of node.specifiers || []) {
      if (spec.type === "ImportSpecifier") {
        names.push(spec.imported.name || spec.imported.value)
      } else if (spec.type === "ImportDefaultSpecifier") {
        names.push("default")
      } else if (spec.type === "ExportSpecifier") {
        names.push(spec.local.name)
      }
    }

    imports.push({ source, target: resolveImport(file, source), line: node.loc.start.line, names })
  }
  return imports
}

// resolveImport finds the file a relative import names, the way webpack does:
// as written, then with .js added, then as a folder's index.js. When none
// exists it returns the path as written, which the caller reports as missing.
function resolveImport(file, source) {
  const base = path.resolve(path.dirname(file), source)
  for (const candidate of [base, base + ".js", path.join(base, "index.js")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return base
}

// exportedNames returns the names a module exports, and whether it also
// re-exports everything from another module (then any name might exist).
function exportedNames(program) {
  const names = new Set()
  let exportsAll = false

  for (const node of program.body) {
    if (node.type === "ExportDefaultDeclaration") {
      names.add("default")
    } else if (node.type === "ExportAllDeclaration") {
      exportsAll = true
    } else if (node.type === "ExportNamedDeclaration") {
      addDeclaredNames(node.declaration, names)
      for (const spec of node.specifiers) {
        names.add(spec.exported.name || spec.exported.value)
      }
    }
  }
  return { names, exportsAll }
}

// addDeclaredNames adds the names a function, class, or variable declaration
// introduces.
function addDeclaredNames(declaration, names) {
  if (!declaration) {
    return
  }
  if (declaration.id) {
    names.add(declaration.id.name)
  }
  for (const d of declaration.declarations || []) {
    if (d.id.type === "Identifier") {
      names.add(d.id.name)
    }
  }
}

// importFindings checks every local import of the files: the target exists,
// exports each imported name, and isn't part of an import cycle.
function importFindings(files) {
  const findings = []
  const graph = new Map()
  const programs = new Map()

  function programFor(file) {
    if (!programs.has(file)) {
      programs.set(file, parseModule(file))
    }
    return programs.get(file)
  }

  // Walk out from the given files so cycles through files outside the list are found.
  const queue = [...files]
  const wanted = new Set(files)
  while (queue.length > 0) {
    const file = queue.shift()
    if (graph.has(file)) {
      continue
    }

    const program = programFor(file)
    graph.set(file, [])
    if (program === null) {
      continue
    }

    for (const imp of relativeImports(file, program)) {
      if (!existsSync(imp.target)) {
        if (wanted.has(file)) {
          findings.push({ file, line: imp.line, kind: "missing-file", message: `imports ${imp.source}, which doesn't exist` })
        }
        continue
      }
      if (!imp.target.endsWith(".js")) {
        continue
      }

      graph.get(file).push(imp.target)
      queue.push(imp.target)

      const target = programFor(imp.target)
      if (!wanted.has(file) || target === null) {
        continue
      }
      const { names, exportsAll } = exportedNames(target)
      for (const name of imp.names) {
        if (!exportsAll && !names.has(name)) {
          findings.push({ file, line: imp.line, kind: "missing-export", message: `imports ${name} from ${imp.source}, which doesn't export it` })
        }
      }
    }
  }

  for (const cycle of findCycles(graph)) {
    if (!cycle.some(f => wanted.has(f))) {
      continue
    }
    const listed = cycle.map(f => path.relative(process.cwd(), f)).join(", ")
    findings.push({ file: cycle[0], line: 0, kind: "cycle", message: `import cycle: ${listed}` })
  }
  return findings
}

// findCycles returns each group of files that import each other, directly or
// through others, as a sorted list. It is Tarjan's strongly connected
// components algorithm: a group of more than one file is a cycle.
function findCycles(graph) {
  let counter = 0
  const index = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const cycles = []

  function visit(file) {
    index.set(file, counter)
    low.set(file, counter)
    counter++
    stack.push(file)
    onStack.add(file)

    for (const next of graph.get(file) || []) {
      if (!index.has(next)) {
        visit(next)
        low.set(file, Math.min(low.get(file), low.get(next)))
      } else if (onStack.has(next)) {
        low.set(file, Math.min(low.get(file), index.get(next)))
      }
    }

    if (low.get(file) === index.get(file)) {
      const group = []
      let member
      do {
        member = stack.pop()
        onStack.delete(member)
        group.push(member)
      } while (member !== file)

      if (group.length > 1) {
        cycles.push(group.sort())
      }
    }
  }

  for (const file of graph.keys()) {
    if (!index.has(file)) {
      visit(file)
    }
  }
  return cycles
}

// jsFilesUnder lists every .js file below a folder, leaving out the old Jest
// tests (*.test.js), which use Jest's globals and aren't part of the app.
function jsFilesUnder(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...jsFilesUnder(full))
    } else if (name.endsWith(".js") && !name.endsWith(".test.js")) {
      files.push(full)
    }
  }
  return files
}

// main checks the files named on the command line, or all of ui/src.
async function main() {
  let files = process.argv.slice(2)
  if (files.length === 0) {
    files = jsFilesUnder(path.join(UI_DIR, "src"))
  }

  const findings = await checkFiles(files)
  for (const f of findings) {
    console.log(`${path.relative(process.cwd(), f.file)}:${f.line} ${f.kind} ${f.message}`)
  }
  console.log(`${findings.length} finding(s) in ${files.length} file(s)`)
  if (findings.length > 0) {
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
