// The requests the Packages and Charts pages send, built here without React
// so node tests can check them.

import { statsUrl } from "./statsUrls.js"

// emptyToUndefined turns "" into undefined, so statsUrl leaves the param out.
function emptyToUndefined(value) {
  if (value === "") {
    return undefined
  }
  return value
}

// packagesUrl is the Packages page's request: package stats at the chosen
// confidence, over the date range and the deck filter. An empty date or filter
// is left out of the URL.
export function packagesUrl(cube, { confidence, start, end, match }) {
  return statsUrl(cube, "packages", {
    confidence,
    start: emptyToUndefined(start),
    end: emptyToUndefined(end),
    match: emptyToUndefined(match),
  })
}
