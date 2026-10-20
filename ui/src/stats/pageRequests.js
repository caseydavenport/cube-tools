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

// hasValue reports whether a Charts predicate has a value to filter on, since
// a half-filled predicate row shouldn't filter anything.
function hasValue(predicate) {
  return predicate.value !== ""
}

// pivotRequest is the body the Charts page POSTs to /stats/pivot. Time
// buckets only apply when a dimension is time, so bucket_size is 0 otherwise.
// match is the deck filter, which picks the subject decks.
export function pivotRequest({ start, end, groupBy, splitBy, bucketSize, usesTime, predicates, excluded, confidence, match }) {
  let bucket = 0
  if (usesTime) {
    bucket = Number(bucketSize)
  }

  return {
    start,
    end,
    group_by: groupBy,
    split_by: splitBy,
    bucket_size: bucket,
    predicates: predicates.filter(hasValue),
    exclude_players: [...excluded],
    confidence: Number(confidence),
    match,
  }
}
