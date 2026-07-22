// Win-rate confidence intervals for client-computed stats.
//
// This mirrors the Go implementation in pkg/server/stats/confidence.go so that
// stats we compute in the browser (e.g. archetypes) agree with the ones the
// server returns (cards, colors, pivot). Keep the two in sync.

// The confidence levels offered in the UI. Shared by every confidence selector.
export const WIN_CONFIDENCE_OPTS = [
  { label: "80%", value: "0.8" },
  { label: "90%", value: "0.9" },
  { label: "95%", value: "0.95" },
  { label: "99%", value: "0.99" },
]

// Two-sided normal critical values for the offered levels. A lookup table keeps
// us from pulling in an inverse-normal for four fixed values.
const Z_BY_CONFIDENCE = {
  "0.8": 1.2815515594,
  "0.9": 1.6448536270,
  "0.95": 1.9599639845,
  "0.99": 2.5758293035,
}

export function zForConfidence(confidence) {
  return Z_BY_CONFIDENCE[String(confidence)] ?? Z_BY_CONFIDENCE["0.8"]
}

// winInterval returns the Wilson score interval for a win rate, on a 0-100 scale
// rounded to one decimal, with draws counting as half a win. A record with no
// games returns a zero interval that isn't significant. significant means the
// interval excludes 50%, i.e. the rate is distinguishable from a coin flip.
export function winInterval(wins, losses, draws, confidence) {
  const n = wins + losses + draws
  if (n === 0) {
    return { low: 0, high: 0, significant: false }
  }

  const z = zForConfidence(confidence)
  const phat = (wins + draws / 2) / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (phat + z2 / (2 * n)) / denom
  const margin = (z / denom) * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))

  let low = center - margin
  let high = center + margin
  if (low < 0) low = 0
  if (high > 1) high = 1
  low = Math.round(1000 * low) / 10
  high = Math.round(1000 * high) / 10

  return { low, high, significant: low > 50 || high < 50 }
}
