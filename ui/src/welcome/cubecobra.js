// Reads a CubeCobra cube id out of whatever someone pastes: a bare id or a link
// to the cube on cubecobra.com. Kept free of imports so node tests can load it.

// CubeCobra ids use letters, digits, "-" and "_", the same rule the server
// checks (pkg/cubes/cubecobra.go ValidCubeCobraID).
const VALID_ID = /^[A-Za-z0-9_-]+$/

// isCubeCobraHost reports whether a URL's host is cubecobra.com, with or
// without "www.".
function isCubeCobraHost(host) {
  return host === "cubecobra.com" || host === "www.cubecobra.com"
}

// idFromLink returns the cube id from a CubeCobra link shaped like
// /cube/<view>/<id> (for example /cube/overview/polyversal), or null.
function idFromLink(text) {
  let withScheme = text
  if (!/^https?:\/\//i.test(text)) {
    withScheme = "https://" + text
  }

  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (!isCubeCobraHost(url.hostname.toLowerCase())) {
    return null
  }

  const parts = url.pathname.split("/").filter(part => part !== "")
  if (parts.length < 3 || parts[0] !== "cube") {
    return null
  }
  return parts[2]
}

// parseCubeCobraInput returns the CubeCobra id in the pasted text, or null when
// the text is neither a valid id nor a CubeCobra cube link.
export function parseCubeCobraInput(text) {
  const trimmed = (text || "").trim()
  if (trimmed === "") {
    return null
  }

  // Anything with a slash is treated as a link; anything else as a bare id.
  let id = trimmed
  if (trimmed.includes("/")) {
    id = idFromLink(trimmed)
  }

  if (id === null || !VALID_ID.test(id)) {
    return null
  }
  return id
}
