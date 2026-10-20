// text-snapshot records the text each stats and design page shows, so a change
// that only moves text into COPY can prove the pages read the same after it.
// It drives headless Chrome over the DevTools protocol and needs nothing else.
//
//   node ui/scripts/text-snapshot.mjs take <out.json> [--shots <dir>] [--scheme light|dark] [--width <px>] [--only <route,route>]
//   node ui/scripts/text-snapshot.mjs compare <a.json> <b.json> [routes…]
//   node ui/scripts/text-snapshot.mjs compare-shots <a.json> <b.json> [--out <dir>] [--json <file>]
//
// take expects Chrome with --remote-debugging-port=9333 and the UI on :6061
// (UI_PORT overrides it). The scheme defaults to light and the width to 1680.
// compare exits 1 if any route's text differs. compare-shots prints the share
// of pixels that changed per route, and with --out writes a PNG of each
// differing route with the changed pixels in magenta, and --json saves each
// route's changed-pixel count and box. Each line shows the count and the box
// of changed pixels. It exits 1 on any change.

import { Buffer } from "node:buffer"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CHROME_PORT = 9333
const UI_PORT = process.env.UI_PORT || "6061"

// The page slugs whose text is moving into COPY, and the cubes to load them on.
const PAGES = ["cards", "colors", "health", "players", "archetypes", "deck-stats", "synergy", "charts", "removal", "packages", "synergy-map", "rules-editor"]
const CUBES = ["polyverse", "cc:polyversal"]

// UNFINISHED_MARKERS are texts a page shows while it waits for the backend or
// after a request failed. A snapshot containing one was taken too early.
const UNFINISHED_MARKERS = ["Loading", "Couldn't load"]

// The routes outside the stats pages, on every cube, and the import flow's
// modes, which only the local cube has.
const CUBE_ROUTES = ["", "decks", "drafts"]
const IMPORT_MODES = ["paste", "upload", "dir", "hedron", "photos", "ocr"]

// EMPTY_MATCH is a filter no deck passes, so each page shows its empty states.
const EMPTY_MATCH = "?match=player%3Anobodyatall"

// ROUTES lists every route take visits, as "<cube>/<page>[?query]".
export const ROUTES = buildRoutes()

// Attributes whose values people see on hover or in an empty input.
const RECORDED_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"]

// The browser window's default width and its height, fixed so screenshots
// line up between runs.
const DEFAULT_WIDTH = 1680
const VIEWPORT_HEIGHT = 1200
const SCHEMES = ["light", "dark"]

// How long the network must stay quiet, and the extra wait after that.
const IDLE_MS = 500
const SETTLE_MS = 1500
const PAGE_TIMEOUT_MS = 60000

// buildRoutes returns each page on each cube, then each page on the first cube
// with a filter that matches nothing.
function buildRoutes() {
  const routes = []
  for (const cube of CUBES) {
    for (const page of PAGES) {
      routes.push(`${cube}/${page}`)
    }
  }
  for (const page of PAGES) {
    routes.push(`${CUBES[0]}/${page}${EMPTY_MATCH}`)
  }

  routes.push("welcome")
  for (const cube of CUBES) {
    for (const page of CUBE_ROUTES) {
      routes.push(page === "" ? cube : `${cube}/${page}`)
    }
  }
  routes.push(`${CUBES[0]}/import`)
  for (const mode of IMPORT_MODES) {
    routes.push(`${CUBES[0]}/import/${mode}`)
  }
  return routes
}

// EMPTY_COUNTS is what the stats pages show before any deck data has arrived.
// A route with a filter in its query is meant to match nothing, so it may.
const EMPTY_COUNTS = "0 drafts · 0 decks"

// unfinishedMarker returns the first UNFINISHED_MARKERS text in a route's
// lines, EMPTY_COUNTS when an unfiltered route shows it, or null when the page
// looks fully loaded.
export function unfinishedMarker(lines, route = "") {
  for (const marker of UNFINISHED_MARKERS) {
    if (lines.some(line => line.includes(marker))) {
      return marker
    }
  }
  if (!route.includes("match=") && lines.some(line => line.includes(EMPTY_COUNTS))) {
    return EMPTY_COUNTS
  }
  return null
}

// unfinishedRoutes lists { route, marker } for each route in a snapshot whose
// text shows a loading or error message.
export function unfinishedRoutes(snapshot) {
  const found = []
  for (const [route, entry] of Object.entries(snapshot.routes)) {
    const marker = unfinishedMarker(entry.lines, route)
    if (marker !== null) {
      found.push({ route, marker })
    }
  }
  return found
}

// growBox returns the box { x0, y0, x1, y1 } (inclusive pixel corners) that
// holds the given box and the pixel at x, y. A null box starts a new one.
export function growBox(box, x, y) {
  if (box === null) {
    return { x0: x, y0: y, x1: x, y1: y }
  }
  return { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
}

// formatBox describes a changed-pixel box as "x0,y0 to x1,y1 (W x H)".
export function formatBox(box) {
  if (box === null) {
    return "none"
  }
  return `${box.x0},${box.y0} to ${box.x1},${box.y1} (${box.x1 - box.x0 + 1} x ${box.y1 - box.y0 + 1})`
}

// routeHash returns the part of the URL after "#" that loads a route. The
// welcome page is the site's root.
export function routeHash(route) {
  if (route === "welcome") {
    return "/"
  }
  return `/${route}`
}

// shotName returns the screenshot file name for a route, with the scheme and
// width in it so takes into one folder don't overwrite each other.
export function shotName(route, scheme, width) {
  return `${route.replace(/[^A-Za-z0-9-]+/g, "_")}-${scheme}-${width}.png`
}

// viewport returns the browser window settings for a width.
function viewport(width, height = VIEWPORT_HEIGHT) {
  return { width, height, deviceScaleFactor: 1, mobile: false }
}

// compareSnapshots returns, for each route that differs between snapshots a
// and b, the lines and attribute values only a has (missing) and only b has
// (added). `routes` limits it to those routes, matched by full name or page
// slug; an empty list compares every route.
export function compareSnapshots(a, b, routes) {
  const results = []
  for (const route of matchingRoutes(a, b, routes)) {
    const before = routeItems(a, route)
    const after = routeItems(b, route)
    const missing = itemsNotIn(before, after)
    const added = itemsNotIn(after, before)
    if (missing.length > 0 || added.length > 0) {
      results.push({ route, missing, added })
    }
  }
  return results
}

// differingShots returns the routes whose screenshots differ byte for byte,
// or [] when either snapshot was taken without screenshots.
export function differingShots(a, b, routes) {
  if (!a.shots || !b.shots) {
    return []
  }
  const differing = []
  for (const route of matchingRoutes(a, b, routes)) {
    const before = shotBytes(a, route)
    const after = shotBytes(b, route)
    if (before === null || after === null || !before.equals(after)) {
      differing.push(route)
    }
  }
  return differing
}

// shotBytes reads a route's screenshot, or returns null when there isn't one.
function shotBytes(snapshot, route) {
  const entry = snapshot.routes[route]
  if (!entry || !entry.shot) {
    return null
  }
  const file = path.join(snapshot.shots, entry.shot)
  if (!existsSync(file)) {
    return null
  }
  return readFileSync(file)
}

// matchingRoutes lists the routes in either snapshot that the filter keeps.
function matchingRoutes(a, b, routes) {
  const names = [...Object.keys(a.routes)]
  for (const name of Object.keys(b.routes)) {
    if (!names.includes(name)) {
      names.push(name)
    }
  }
  if (routes.length === 0) {
    return names
  }
  return names.filter(name => routes.includes(name) || routes.includes(pageSlug(name)))
}

// pageSlug returns the page part of a route: "cards" for
// "cc:polyversal/cards?match=…".
function pageSlug(route) {
  const withoutQuery = route.split("?")[0]
  const parts = withoutQuery.split("/")
  return parts[parts.length - 1]
}

// routeItems returns a route's text lines and attribute values as one list.
function routeItems(snapshot, route) {
  const entry = snapshot.routes[route]
  if (!entry) {
    return []
  }
  return [...entry.lines, ...entry.attrs]
}

// itemsNotIn returns the items of `list` that `other` doesn't have, counting
// repeats: a line shown twice before and once after appears once.
function itemsNotIn(list, other) {
  const counts = new Map()
  for (const item of other) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }
  const left = []
  for (const item of list) {
    const count = counts.get(item) || 0
    if (count > 0) {
      counts.set(item, count - 1)
    } else {
      left.push(item)
    }
  }
  return left
}

// openTab opens a new Chrome tab and returns a small DevTools client for it:
// send(method, params) runs a command, on(method, fn) listens to an event,
// once(method) waits for the next one, and close() closes the tab.
async function openTab() {
  const res = await fetch(`http://localhost:${CHROME_PORT}/json/new?about:blank`, { method: "PUT" })
  const target = await res.json()
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve)
    socket.addEventListener("error", reject)
  })

  let nextId = 1
  const pending = new Map()
  const listeners = new Map()

  socket.addEventListener("message", event => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) {
        reject(new Error(`${msg.error.message} (${msg.error.code})`))
      } else {
        resolve(msg.result)
      }
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of [...listeners.get(msg.method)]) {
        fn(msg.params)
      }
    }
  })

  // send runs one DevTools command and resolves with its result.
  function send(method, params = {}) {
    const id = nextId++
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  // on calls fn each time Chrome sends the named event.
  function on(method, fn) {
    if (!listeners.has(method)) {
      listeners.set(method, [])
    }
    listeners.get(method).push(fn)
  }

  // once resolves the next time Chrome sends the named event.
  function once(method) {
    return new Promise(resolve => {
      const fn = params => {
        const list = listeners.get(method)
        list.splice(list.indexOf(fn), 1)
        resolve(params)
      }
      on(method, fn)
    })
  }

  // close shuts the connection and the tab.
  async function close() {
    socket.close()
    await fetch(`http://localhost:${CHROME_PORT}/json/close/${target.id}`)
  }

  return { send, on, once, close }
}

// trackRequests watches the tab's network requests. The returned object's
// quietSince() says how long the network has been idle (0 while busy),
// pending() lists the URLs still loading, and reset() forgets them all.
function trackRequests(tab) {
  const inFlight = new Map()
  let lastChange = Date.now()

  tab.on("Network.requestWillBeSent", p => {
    inFlight.set(p.requestId, p.request.url)
    lastChange = Date.now()
  })
  for (const done of ["Network.loadingFinished", "Network.loadingFailed"]) {
    tab.on(done, p => {
      inFlight.delete(p.requestId)
      lastChange = Date.now()
    })
  }

  return {
    quietSince() {
      if (inFlight.size > 0) {
        return 0
      }
      return Date.now() - lastChange
    },
    pending() {
      return [...inFlight.values()]
    },
    reset() {
      inFlight.clear()
      lastChange = Date.now()
    },
  }
}

// sleep waits the given number of milliseconds.
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// waitForIdle waits until the network has been quiet for IDLE_MS, or gives up
// after PAGE_TIMEOUT_MS and says so.
async function waitForIdle(requests, route) {
  const deadline = Date.now() + PAGE_TIMEOUT_MS
  while (requests.quietSince() < IDLE_MS) {
    if (Date.now() > deadline) {
      console.warn(`${route}: network never went idle (${requests.pending().join(", ")}); recording anyway`)
      return
    }
    await sleep(100)
  }
}

// READ_PAGE runs in the page. It returns the visible text lines of the main
// area and toolbar (or the welcome page, which has neither), plus their hover
// and placeholder values and option labels.
const READ_PAGE = `(() => {
  const found = [...document.querySelectorAll(".se-toolbar, .se-main, .welcome-page")]
  const roots = found.filter(el => !found.some(other => other !== el && other.contains(el)))
  const lines = []
  const attrs = []
  for (const root of roots) {
    for (const line of root.innerText.split("\\n")) {
      if (line.trim() !== "") {
        lines.push(line.trim())
      }
    }
    for (const el of root.querySelectorAll("*")) {
      for (const name of ${JSON.stringify(RECORDED_ATTRIBUTES)}) {
        if (el.hasAttribute(name)) {
          attrs.push(name + "=" + el.getAttribute(name))
        }
      }
      if (el.tagName === "OPTION") {
        attrs.push("option=" + el.textContent.trim())
      }
    }
  }
  return { lines, attrs }
})()`

// HIDE_OVERLAY removes the dev server's error overlay, which a harmless
// "ResizeObserver loop" warning can pop over the page at random.
const HIDE_OVERLAY = `document.getElementById("webpack-dev-server-client-overlay")?.remove()`

// visit loads one route from a blank page, waits for it to settle, and
// returns its text, saving a screenshot into shotsDir when one is given.
// `look` is { scheme, width }.
async function visit(tab, requests, route, shotsDir, look) {
  const blank = tab.once("Page.loadEventFired")
  await tab.send("Page.navigate", { url: "about:blank" })
  await blank
  requests.reset()

  const loaded = tab.once("Page.loadEventFired")
  await tab.send("Page.navigate", { url: `http://localhost:${UI_PORT}/#${routeHash(route)}` })
  await loaded
  await waitForIdle(requests, route)
  await sleep(SETTLE_MS)

  const result = await tab.send("Runtime.evaluate", { expression: READ_PAGE, returnByValue: true })
  const entry = { lines: result.result.value.lines, attrs: result.result.value.attrs, shot: null }
  if (entry.lines.length === 0) {
    console.warn(`${route}: no text found under .se-main, .se-toolbar or .welcome-page`)
  }
  const marker = unfinishedMarker(entry.lines, route)
  if (marker !== null) {
    console.warn(`${route}: shows "${marker}"; the backend may be down or slow`)
  }

  if (shotsDir) {
    entry.shot = shotName(route, look.scheme, look.width)
    await saveShot(tab, path.join(shotsDir, entry.shot), look.width)
  }
  return entry
}

// visitSettled visits a route, and revisits it up to twice more while its text
// still looks unfinished, since a slow backend answer often lands on a retry.
async function visitSettled(tab, requests, route, shotsDir, look) {
  let entry = await visit(tab, requests, route, shotsDir, look)
  for (let attempt = 1; attempt < 3 && unfinishedMarker(entry.lines, route) !== null; attempt++) {
    entry = await visit(tab, requests, route, shotsDir, look)
  }
  return entry
}

// saveShot screenshots the whole page into file. It grows the window to the
// page's full height first and waits for charts to redraw at that size, which
// gives the same picture every run.
async function saveShot(tab, file, width) {
  await tab.send("Runtime.evaluate", { expression: HIDE_OVERLAY })
  const metrics = await tab.send("Page.getLayoutMetrics")
  const height = Math.ceil(metrics.cssContentSize.height)
  await tab.send("Emulation.setDeviceMetricsOverride", viewport(width, height))
  await sleep(SETTLE_MS)
  await tab.send("Runtime.evaluate", { expression: HIDE_OVERLAY })

  const shot = await tab.send("Page.captureScreenshot", { format: "png" })
  writeFileSync(file, Buffer.from(shot.data, "base64"))
  await tab.send("Emulation.setDeviceMetricsOverride", viewport(width))
}

// take visits every route in ROUTES in the given color scheme and window
// width, and writes the snapshot to outFile.
async function take(outFile, shotsDir, look, routes) {
  if (shotsDir) {
    shotsDir = path.resolve(shotsDir)
    mkdirSync(shotsDir, { recursive: true })
  }

  const tab = await openTab()
  const requests = trackRequests(tab)
  await tab.send("Page.enable")
  await tab.send("Network.enable")
  await tab.send("Emulation.setDeviceMetricsOverride", viewport(look.width))
  await tab.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: look.scheme }] })
  await tab.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("mantine-color-scheme-value", ${JSON.stringify(look.scheme)}) } catch {}`,
  })

  const snapshot = { taken: new Date().toISOString(), uiPort: UI_PORT, scheme: look.scheme, width: look.width, shots: shotsDir || null, routes: {} }
  try {
    for (const route of routes) {
      snapshot.routes[route] = await visitSettled(tab, requests, route, shotsDir, look)
      console.log(`${route}: ${snapshot.routes[route].lines.length} lines`)
    }
  } finally {
    await tab.close()
  }
  writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n")
  console.log(`wrote ${routes.length} routes to ${outFile}`)

  const unfinished = unfinishedRoutes(snapshot)
  if (unfinished.length > 0) {
    console.warn(`${unfinished.length} route(s) look unfinished:`)
    for (const { route, marker } of unfinished) {
      console.warn(`  ${route} ("${marker}")`)
    }
  }
}

// compare prints how two snapshot files differ and exits 1 if their text does.
function compare(fileA, fileB, routes) {
  const a = JSON.parse(readFileSync(fileA, "utf8"))
  const b = JSON.parse(readFileSync(fileB, "utf8"))

  const diffs = compareSnapshots(a, b, routes)
  for (const diff of diffs) {
    console.log(diff.route)
    for (const item of diff.missing) {
      console.log(`  - ${item}`)
    }
    for (const item of diff.added) {
      console.log(`  + ${item}`)
    }
  }
  for (const route of differingShots(a, b, routes)) {
    console.log(`screenshot differs: ${route}`)
  }

  console.log(`${diffs.length} route(s) with different text`)
  if (diffs.length > 0) {
    process.exit(1)
  }
}

// PIXEL_DIFF runs in the page. Given two PNGs as base64 strings it draws each
// onto a canvas, counts the pixels whose color differs (pixels outside the
// smaller image count as changed), and returns the count, the total, and a
// PNG data URL of the second image with the changed pixels in magenta.
const PIXEL_DIFF = `async (aBase64, bBase64) => {
  const growBox = ${growBox.toString()}
  const load = base64 => new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("cannot decode image"))
    image.src = "data:image/png;base64," + base64
  })
  const [a, b] = await Promise.all([load(aBase64), load(bBase64)])
  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)
  const pixels = image => {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, width, height)
  }
  const dataA = pixels(a)
  const dataB = pixels(b)
  let changed = 0
  let box = null
  for (let i = 0; i < dataA.data.length; i += 4) {
    const same = dataA.data[i] === dataB.data[i] && dataA.data[i + 1] === dataB.data[i + 1] &&
      dataA.data[i + 2] === dataB.data[i + 2] && dataA.data[i + 3] === dataB.data[i + 3]
    if (!same) {
      changed++
      box = growBox(box, (i / 4) % width, Math.floor(i / 4 / width))
      dataB.data[i] = 255
      dataB.data[i + 1] = 0
      dataB.data[i + 2] = 255
      dataB.data[i + 3] = 255
    }
  }
  const out = document.createElement("canvas")
  out.width = width
  out.height = height
  out.getContext("2d").putImageData(dataB, 0, 0)
  return { changed, box, total: width * height, diff: out.toDataURL("image/png"), sizeA: [a.width, a.height], sizeB: [b.width, b.height] }
}`

// percentChanged formats a changed-pixel share: "0.00%" only when nothing
// changed, and "<0.01%" when a few pixels did.
export function percentChanged(changed, total) {
  if (changed === 0 || total === 0) {
    return "0.00%"
  }
  const percent = changed / total * 100
  if (percent < 0.005) {
    return "<0.01%"
  }
  return `${percent.toFixed(2)}%`
}

// compareShots prints, for each route both snapshots have a screenshot of, the
// share of changed pixels. With outDir it writes a PNG per differing route.
// It exits 1 if any route differs or lacks a screenshot.
async function compareShots(fileA, fileB, outDir, jsonFile) {
  const a = JSON.parse(readFileSync(fileA, "utf8"))
  const b = JSON.parse(readFileSync(fileB, "utf8"))
  if (outDir) {
    outDir = path.resolve(outDir)
    mkdirSync(outDir, { recursive: true })
  }

  const tab = await openTab()
  let differing = 0
  const measured = {}
  try {
    await tab.send("Runtime.enable")
    for (const route of matchingRoutes(a, b, [])) {
      const before = shotBytes(a, route)
      const after = shotBytes(b, route)
      if (before === null || after === null) {
        console.log(`${route}: no screenshot in ${before === null ? fileA : fileB}`)
        differing++
        continue
      }

      const call = `(${PIXEL_DIFF})(${JSON.stringify(before.toString("base64"))}, ${JSON.stringify(after.toString("base64"))})`
      const result = await tab.send("Runtime.evaluate", { expression: call, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) {
        throw new Error(`${route}: ${result.exceptionDetails.exception.description}`)
      }
      const { changed, box, total, diff, sizeA, sizeB } = result.result.value
      measured[route] = { changed, box }

      let note = ""
      if (sizeA[0] !== sizeB[0] || sizeA[1] !== sizeB[1]) {
        note = `  (size ${sizeA.join("x")} vs ${sizeB.join("x")})`
      }
      console.log(`${route}: ${percentChanged(changed, total)} (${changed} px, box ${formatBox(box)})${note}`)
      if (changed > 0) {
        differing++
        if (outDir) {
          const png = Buffer.from(diff.slice(diff.indexOf(",") + 1), "base64")
          writeFileSync(path.join(outDir, b.routes[route].shot), png)
        }
      }
    }
  } finally {
    await tab.close()
  }

  if (jsonFile) {
    writeFileSync(jsonFile, JSON.stringify(measured, null, 2) + "\n")
  }
  console.log(`${differing} route(s) with different screenshots`)
  if (differing > 0) {
    process.exit(1)
  }
}

// option removes "--name value" from args and returns the value, or the
// fallback when the option isn't there.
function option(args, name, fallback) {
  const at = args.indexOf(name)
  if (at === -1) {
    return fallback
  }
  const value = args[at + 1]
  args.splice(at, 2)
  return value
}

// main reads the command and its arguments.
async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === "take") {
    const shotsDir = option(args, "--shots", null)
    const scheme = option(args, "--scheme", "light")
    const width = Number(option(args, "--width", DEFAULT_WIDTH))
    if (!SCHEMES.includes(scheme) || !(width > 0)) {
      console.error("--scheme must be light or dark and --width a number of pixels")
      process.exit(2)
    }
    const only = option(args, "--only", null)
    let routes = ROUTES
    if (only) {
      routes = only.split(",")
    }
    await take(args[0], shotsDir, { scheme, width }, routes)
  } else if (command === "compare") {
    compare(args[0], args[1], args.slice(2))
  } else if (command === "compare-shots") {
    const outDir = option(args, "--out", null)
    const jsonFile = option(args, "--json", null)
    await compareShots(args[0], args[1], outDir, jsonFile)
  } else {
    console.error("usage: text-snapshot.mjs take <out.json> [--shots <dir>] [--scheme light|dark] [--width <px>] [--only <route,route>] | compare <a.json> <b.json> [routes…] | compare-shots <a.json> <b.json> [--out <dir>] [--json <file>]")
    process.exit(2)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
