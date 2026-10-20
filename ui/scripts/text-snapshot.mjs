// text-snapshot records the text each stats and design page shows, so a change
// that only moves text into COPY can prove the pages read the same after it.
// It drives headless Chrome over the DevTools protocol and needs nothing else.
//
//   node ui/scripts/text-snapshot.mjs take <out.json> [--shots <dir>]
//   node ui/scripts/text-snapshot.mjs compare <a.json> <b.json> [routes…]
//
// take expects Chrome with --remote-debugging-port=9333 and the UI on :6061
// (UI_PORT overrides it). compare exits 1 if any route's text differs.

import { Buffer } from "node:buffer"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CHROME_PORT = 9333
const UI_PORT = process.env.UI_PORT || "6061"

// The page slugs whose text is moving into COPY, and the cubes to load them on.
const PAGES = ["cards", "colors", "health", "players", "archetypes", "deck-stats", "synergy", "charts", "removal", "packages", "synergy-map", "rules-editor"]
const CUBES = ["polyverse", "cc:polyversal"]

// EMPTY_MATCH is a filter no deck passes, so each page shows its empty states.
const EMPTY_MATCH = "?match=player%3Anobodyatall"

// ROUTES lists every route take visits, as "<cube>/<page>[?query]".
export const ROUTES = buildRoutes()

// Attributes whose values people see on hover or in an empty input.
const RECORDED_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"]

// The browser window size, fixed so screenshots line up between runs.
const VIEWPORT = { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false }

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
  return routes
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
// area and toolbar, plus their hover and placeholder values and option labels.
const READ_PAGE = `(() => {
  const found = [...document.querySelectorAll(".se-toolbar, .se-main")]
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
async function visit(tab, requests, route, shotsDir) {
  const blank = tab.once("Page.loadEventFired")
  await tab.send("Page.navigate", { url: "about:blank" })
  await blank
  requests.reset()

  const loaded = tab.once("Page.loadEventFired")
  await tab.send("Page.navigate", { url: `http://localhost:${UI_PORT}/#/${route}` })
  await loaded
  await waitForIdle(requests, route)
  await sleep(SETTLE_MS)

  const result = await tab.send("Runtime.evaluate", { expression: READ_PAGE, returnByValue: true })
  const entry = { lines: result.result.value.lines, attrs: result.result.value.attrs, shot: null }
  if (entry.lines.length === 0) {
    console.warn(`${route}: no text found under .se-main or .se-toolbar`)
  }

  if (shotsDir) {
    entry.shot = route.replace(/[^A-Za-z0-9-]+/g, "_") + ".png"
    await saveShot(tab, path.join(shotsDir, entry.shot))
  }
  return entry
}

// saveShot screenshots the whole page into file. It grows the window to the
// page's full height first and waits for charts to redraw at that size, which
// gives the same picture every run.
async function saveShot(tab, file) {
  await tab.send("Runtime.evaluate", { expression: HIDE_OVERLAY })
  const metrics = await tab.send("Page.getLayoutMetrics")
  const height = Math.ceil(metrics.cssContentSize.height)
  await tab.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, height })
  await sleep(SETTLE_MS)
  await tab.send("Runtime.evaluate", { expression: HIDE_OVERLAY })

  const shot = await tab.send("Page.captureScreenshot", { format: "png" })
  writeFileSync(file, Buffer.from(shot.data, "base64"))
  await tab.send("Emulation.setDeviceMetricsOverride", VIEWPORT)
}

// take visits every route in ROUTES in the light scheme and writes the
// snapshot to outFile.
async function take(outFile, shotsDir) {
  if (shotsDir) {
    shotsDir = path.resolve(shotsDir)
    mkdirSync(shotsDir, { recursive: true })
  }

  const tab = await openTab()
  const requests = trackRequests(tab)
  await tab.send("Page.enable")
  await tab.send("Network.enable")
  await tab.send("Emulation.setDeviceMetricsOverride", VIEWPORT)
  await tab.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] })
  await tab.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("mantine-color-scheme-value", "light") } catch {}`,
  })

  const snapshot = { taken: new Date().toISOString(), uiPort: UI_PORT, shots: shotsDir || null, routes: {} }
  try {
    for (const route of ROUTES) {
      snapshot.routes[route] = await visit(tab, requests, route, shotsDir)
      console.log(`${route}: ${snapshot.routes[route].lines.length} lines`)
    }
  } finally {
    await tab.close()
  }
  writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n")
  console.log(`wrote ${ROUTES.length} routes to ${outFile}`)
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

// main reads the command and its arguments.
async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === "take") {
    const shotsAt = args.indexOf("--shots")
    let shotsDir = null
    if (shotsAt !== -1) {
      shotsDir = args[shotsAt + 1]
    }
    await take(args[0], shotsDir)
  } else if (command === "compare") {
    compare(args[0], args[1], args.slice(2))
  } else {
    console.error("usage: text-snapshot.mjs take <out.json> [--shots <dir>] | compare <a.json> <b.json> [routes…]")
    process.exit(2)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
