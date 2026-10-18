// Deck comparison is carried in the URL as ?compare=<ref>,<ref>, beside the
// highlighted ?deck=<ref>, so a comparison is linkable like a single deck.

// parseCompare splits the compare param into deck refs.
export function parseCompare(param) {
  return (param || "").split(",").filter(r => r !== "")
}

// formatCompare joins deck refs for the compare param. One deck is not a
// comparison, so it gives "" and the param is dropped.
export function formatCompare(refs) {
  return refs.length > 1 ? refs.join(",") : ""
}

// toggleRef adds ref to the comparison, or removes it if already there.
export function toggleRef(refs, ref) {
  return refs.includes(ref) ? refs.filter(r => r !== ref) : [...refs, ref]
}

// comparisonMap resolves refs to loaded decks, in order, then adds the
// highlighted deck, which is always compared. Refs not loaded (filtered out,
// or stale links) are skipped.
export function comparisonMap(refs, highlighted, decks, refOf) {
  const byRef = new Map(decks.map(d => [refOf(d), d]))
  const out = new Map()
  for (const r of [...refs, highlighted]) {
    if (r && byRef.has(r) && !out.has(r)) {
      out.set(r, byRef.get(r))
    }
  }
  return out
}

// addToComparison applies a ctrl-click on ref. The first one starts a
// comparison with the highlighted deck; a deck already compared is dropped.
// The clicked deck is highlighted, or, when it was dropped, the last one left.
export function addToComparison(refs, highlighted, ref) {
  const base = refs.length > 0 ? refs : [highlighted].filter(r => r !== "")
  const next = toggleRef(base, ref)
  if (next.includes(ref)) {
    return { refs: next, highlighted: ref }
  }
  return { refs: next, highlighted: next[next.length - 1] || "" }
}
