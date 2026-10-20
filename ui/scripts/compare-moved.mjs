// compare-moved proves a file split moved code without changing it. It takes
// every top-level declaration (function, const, class) from the old files at a
// git ref, with its leading comments, and checks each one appears word for word
// in exactly one of the new files. Adding or dropping `export` is allowed.
//
// Give every path from the repo root; it works from any directory, including
// `npm --prefix ui run compare-moved -- <ref> <old files…> -- <new files…>`:
//   node ui/scripts/compare-moved.mjs <ref> <old files…> -- <new files…>
// It exits 1 if a declaration changed, went missing, or appears twice.

import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(path.join(UI_DIR, "package.json"))
const babelParser = require("@babel/parser")

// compareMoved compares old and new sources, each a list of { path, text }.
// It returns the declaration names that changed text, went missing, are new,
// or are declared in more than one new file. Other top-level statements, like
// a ChartJS.register call, are matched by their text and may repeat.
export function compareMoved(oldSources, newSources) {
  const oldDecls = new Map()
  for (const source of oldSources) {
    for (const decl of declarations(source.text)) {
      oldDecls.set(decl.name, decl.text)
    }
  }

  const newDecls = new Map()
  const duplicated = new Set()
  for (const source of newSources) {
    for (const decl of declarations(source.text)) {
      if (newDecls.has(decl.name) && !decl.statement) {
        duplicated.add(decl.name)
      }
      newDecls.set(decl.name, decl.text)
    }
  }

  const changed = []
  const missing = []
  for (const [name, text] of oldDecls) {
    if (!newDecls.has(name)) {
      missing.push(name)
    } else if (newDecls.get(name) !== text) {
      changed.push(name)
    }
  }

  const added = [...newDecls.keys()].filter(name => !oldDecls.has(name))
  return { changed, missing, added, duplicated: [...duplicated] }
}

// declarations lists a module's top-level declarations as { name, text,
// statement }. text is the leading comments plus the declaration without any
// `export`. Imports are skipped; any other statement is named by its own text.
function declarations(source) {
  const program = babelParser.parse(source, { sourceType: "module", plugins: ["jsx"] }).program
  const decls = []

  for (const node of program.body) {
    if (node.type === "ImportDeclaration") {
      continue
    }

    let inner = node
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") && node.declaration) {
      inner = node.declaration
    }

    const comments = attachedComments(source, node).map(c => source.slice(c.start, c.end))
    const text = [...comments, source.slice(inner.start, node.end)].join("\n")

    const name = declarationName(inner)
    if (name === null) {
      decls.push({ name: text, text, statement: true })
    } else {
      decls.push({ name, text, statement: false })
    }
  }
  return decls
}

// attachedComments returns the comments directly above a node: the last run
// of leading comments with no blank line between them and the node. A file's
// header comment, set off by a blank line, isn't part of the declaration.
function attachedComments(source, node) {
  const comments = node.leadingComments || []
  const attached = []
  let end = node.start
  for (let i = comments.length - 1; i >= 0; i--) {
    const gap = source.slice(comments[i].end, end)
    if ((gap.match(/\n/g) || []).length > 1) {
      break
    }
    attached.unshift(comments[i])
    end = comments[i].start
  }
  return attached
}

// declarationName returns the name a function, class, or variable declaration
// introduces (names joined with "," when one const declares several), or null
// for any other statement.
function declarationName(node) {
  if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) {
    return node.id.name
  }
  if (node.type === "VariableDeclaration") {
    return node.declarations.map(d => bindingName(d.id)).join(",")
  }
  return null
}

// bindingName names a declared binding; destructuring patterns get a generic name.
function bindingName(id) {
  if (id.type === "Identifier") {
    return id.name
  }
  return "<pattern>"
}

// repoPath turns a path into one relative to the repo root, which is what
// `git show ref:path` needs. Relative paths are taken as already from the root.
export function repoPath(file, root) {
  if (path.isAbsolute(file)) {
    return path.relative(root, file)
  }
  return file
}

// gitRoot returns the repo's top folder.
function gitRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", cwd: UI_DIR }).trim()
}

// readAtRef reads a file as it was at a git ref.
function readAtRef(ref, file, root) {
  return execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8", cwd: root, maxBuffer: 64 * 1024 * 1024 })
}

// main parses `<ref> <old files…> -- <new files…>`, compares, and prints the lists.
function main() {
  const args = process.argv.slice(2)
  const split = args.indexOf("--")
  if (args.length < 3 || split < 2) {
    console.error("usage: compare-moved.mjs <ref> <old files…> -- <new files…>")
    process.exit(2)
  }

  const ref = args[0]
  const root = gitRoot()
  const oldSources = args.slice(1, split).map(p => ({ path: p, text: readAtRef(ref, repoPath(p, root), root) }))
  const newSources = args.slice(split + 1).map(p => ({ path: p, text: readFileSync(path.join(root, repoPath(p, root)), "utf8") }))
  const result = compareMoved(oldSources, newSources)

  for (const key of ["changed", "missing", "duplicated", "added"]) {
    const shown = result[key].map(name => name.split("\n")[0].slice(0, 70))
    console.log(`${key} (${result[key].length}): ${shown.join(", ")}`)
  }

  const failed = result.changed.length + result.missing.length + result.duplicated.length
  if (failed > 0) {
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
