// Pure helpers for HoverStats, kept free of React so node tests can load them.

// meterWidth turns a 0-1 share into the CSS width of a meter's fill, such as
// "42.5%". A share outside 0-1 is clamped to it. It returns "" when the share
// isn't a number, which HoverStats reads as "draw no meter".
export function meterWidth(share) {
  if (typeof share !== "number" || Number.isNaN(share)) {
    return ""
  }
  const clamped = Math.min(1, Math.max(0, share))
  return `${Math.round(clamped * 1000) / 10}%`
}

// toneClass gives the class that tints a value good or bad, or "" for any other
// tone, which leaves the value in the normal text color.
export function toneClass(tone) {
  if (tone === "good") {
    return "kit-pop-good"
  }
  if (tone === "bad") {
    return "kit-pop-bad"
  }
  return ""
}
