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
