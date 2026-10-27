// Building the URLs of the server's stats endpoints.

// statsUrl returns /api/<cube>/stats/<endpoint>?<params>, with the params in
// the order given and encoded for a URL. A param whose value is undefined is
// left out.
export function statsUrl(cube, endpoint, params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.append(key, String(value))
    }
  }
  return `/api/${cube}/stats/${endpoint}?${query.toString()}`
}

// matchWithDeckColors adds the checked deck colors to a search as a dcolor:
// term, which keeps decks that contain every one of those colors. This lets
// the server apply the color checkboxes the same way the browser does.
export function matchWithDeckColors(match, colors) {
  if (colors.length === 0) {
    return match
  }
  const term = "dcolor:" + colors.join("")
  if (match === "") {
    return term
  }
  return match + " " + term
}
