// Matching for the card:"Name" filter term, kept apart from Query.js so
// node tests can load it.

// exactNameMatches reports whether name equals any card: term in terms,
// ignoring case. Several terms mean "any of these", like name: terms.
export function exactNameMatches(terms, name) {
  const lowered = name.toLowerCase()
  for (const term of terms) {
    if (!term.startsWith("card:")) {
      continue
    }
    const wanted = term.slice("card:".length).replace(/"/g, "").toLowerCase()
    if (lowered === wanted) {
      return true
    }
  }
  return false
}
