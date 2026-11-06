// Helpers for the app's cube URLs, which look like "/<cube>/<page>/...".

// pathParts splits a URL path into its non-empty pieces, so "/polyverse/cards"
// becomes ["polyverse", "cards"].
function pathParts(pathname) {
  return pathname.split("/").filter(part => part !== "")
}

// pageSegment returns the page part of a cube URL, the piece right after the
// cube id. A cube's home page has none, so it returns "".
export function pageSegment(pathname) {
  const parts = pathParts(pathname)
  if (parts.length < 2) {
    return ""
  }
  return parts[1]
}

// pageHref builds the link to one of a cube's pages. The home page's path is "".
export function pageHref(cube, path) {
  if (path === "") {
    return `/${cube}`
  }
  return `/${cube}/${path}`
}

// switchCubeInPath swaps the cube id at the start of a path for another cube,
// keeping the rest, so switching cubes stays on the same page.
export function switchCubeInPath(pathname, cube) {
  const parts = pathParts(pathname)
  if (parts.length === 0) {
    return `/${cube}`
  }

  parts[0] = cube
  return "/" + parts.join("/")
}

// pageHrefWithMatch links to one of a cube's pages with its deck filter set to
// match, keeping the date range when start or end is set. The page reads them
// from the URL on load.
export function pageHrefWithMatch(cube, path, match, start, end) {
  const query = new URLSearchParams()
  query.set("match", match)
  if (start) {
    query.set("start", start)
  }
  if (end) {
    query.set("end", end)
  }
  return pageHref(cube, path) + "?" + query.toString().replace(/\+/g, "%20")
}

// cardPageHref links to a card's own page. The name is encoded as one URL
// segment, so a split card's " // " doesn't read as extra path parts.
export function cardPageHref(cube, name) {
  return pageHref(cube, "cards") + "/" + encodeURIComponent(name)
}

// archetypePageHref links to an archetype's or tag's own page.
export function archetypePageHref(cube, name) {
  return pageHref(cube, "archetypes") + "/" + encodeURIComponent(name)
}

// packagePageHref links to a package's own page. The name is encoded as one
// URL segment, so "Auras/Equipment" stays one name.
export function packagePageHref(cube, name) {
  return pageHref(cube, "packages") + "/" + encodeURIComponent(name)
}

// packageMatch is the deck filter for decks that built the package.
export function packageMatch(name) {
  return `package:"${name}"`
}

// deckHrefWithMatch links to one deck on the Decks page, with the deck filter
// set to match and the date range kept, like pageHrefWithMatch. ref is the
// deck's "<draft>/<deck>" id.
export function deckHrefWithMatch(cube, ref, match, start, end) {
  const href = pageHrefWithMatch(cube, "decks", match, start, end)
  return href + "&deck=" + encodeURIComponent(ref)
}

// editorViewHref links to the Rules editor showing one view, such as
// "g:<group>" for a group.
export function editorViewHref(cube, view) {
  const params = new URLSearchParams({ view })
  return pageHref(cube, "rules-editor") + "?" + params.toString()
}

// linkCheckHref links to the Rules editor's link check for cards a and b.
export function linkCheckHref(cube, a, b) {
  return pageHref(cube, "rules-editor/link") + "?" + new URLSearchParams({ a, b }).toString()
}
