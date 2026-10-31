// The requests the Packages, Colors and Charts pages send, built here without React
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

// packageUrl is the package page's request: one package by name, over the
// date range, with intervals at the chosen confidence.
export function packageUrl(cube, { name, start, end, confidence }) {
  return statsUrl(cube, "package", {
    name,
    start: emptyToUndefined(start),
    end: emptyToUndefined(end),
    confidence,
  })
}

// linkCheckUrl is the link check's request: how the rules relate cards a
// and b.
export function linkCheckUrl(cube, a, b) {
  return statsUrl(cube, "link-check", { a, b })
}

// colorStatsUrl is the Colors page's request: color stats for the color mode
// at the chosen confidence. A bucketSize above 0 asks for sliding time
// buckets of that many drafts instead of one total.
export function colorStatsUrl(cube, { start, end, size, colorMode, confidence, match }, bucketSize) {
  const params = { start, end, size, color_mode: colorMode, confidence, match }
  if (bucketSize > 0) {
    params.bucket_size = bucketSize
    params.sliding = true
  }
  return statsUrl(cube, "colors", params)
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
