// Pure helpers behind the search bar: splitting a search into pills, finding
// each pill's keyword in the server's keyword table, and the autocomplete's
// suggestions. Kept free of React so node tests can load them.

// TERM_PATTERN splits a keyword term into keyword, operator and value.
const TERM_PATTERN = /^([a-z_]+)(!=|<=|>=|:|=|<|>)(.*)$/i

// splitPills splits a search into finished pills and the term still being
// typed. A pill ends at a space outside quotes and parentheses, so a quoted
// value or a parenthesized group stays one pill. finished makes the last term
// a pill too, for a search that arrived whole, such as from a link.
export function splitPills(value, finished = false) {
  const pills = []
  let current = ""
  let depth = 0
  let inQuotes = false
  for (const ch of value || "") {
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (!inQuotes && ch === "(") {
      depth += 1
    } else if (!inQuotes && ch === ")") {
      depth = Math.max(0, depth - 1)
    }
    if (ch === " " && !inQuotes && depth === 0) {
      if (current) {
        pills.push(current)
      }
      current = ""
      continue
    }
    current += ch
  }
  if (finished && current) {
    return { pills: [...pills, current], current: "" }
  }
  return { pills, current }
}

// keywordByName finds a keyword by its name or an alias, ignoring case.
export function keywordByName(keywords, name) {
  const lower = name.toLowerCase()
  return keywords.find(kw => kw.name === lower || (kw.aliases || []).includes(lower))
}

// parseTerm splits a pill into its keyword entry, operator and value. A
// leading - (negation) is set aside. Returns null for a bare word, a group
// or "or".
export function parseTerm(term, keywords) {
  const body = term.startsWith("-") ? term.slice(1) : term
  const m = TERM_PATTERN.exec(body)
  if (!m) {
    return null
  }
  return { key: m[1].toLowerCase(), op: m[2], value: m[3].replaceAll('"', ""), keyword: keywordByName(keywords, m[1]) }
}

// pillKind says how to draw a pill: "invalid" for an unknown keyword, an
// operator the keyword doesn't take or a choice it doesn't offer; "deck" for
// a deck keyword; "card" for everything else.
export function pillKind(term, keywords) {
  const parsed = parseTerm(term, keywords)
  if (!parsed) {
    return "card"
  }
  const kw = parsed.keyword
  if (!kw || !kw.operators.includes(parsed.op)) {
    return "invalid"
  }
  if (kw.kind === "choice" && !kw.values.includes(parsed.value.toLowerCase())) {
    return "invalid"
  }
  if (kw.scope === "deck") {
    return "deck"
  }
  return "card"
}

// quoted wraps a value holding a space in double quotes.
function quoted(value) {
  return value.includes(" ") ? `"${value}"` : value
}

// MAX_SUGGESTIONS caps how many values the dropdown lists.
const MAX_SUGGESTIONS = 10

// valueSource picks the values to suggest for a keyword: names the page
// passes in (cards, players, archetypes, events, tags), else the keyword's
// own values.
function valueSource(kw, sources) {
  switch (kw.name) {
    case "name":
    case "card":
      return (sources.cardNames || []).map(name => ({ value: name, description: "Card name" }))
    case "player":
      return (sources.playerNames || []).map(name => ({ value: name, description: "Player" }))
    case "arch":
      return (sources.archetypes || []).map(name => ({ value: name, description: "Archetype" }))
    case "event":
      return (sources.eventCodes || []).map(code => ({ value: code, description: "Event code" }))
    case "otag":
    case "cctag":
      return (sources.tags || {})[kw.name] || []
  }
  return (kw.values || []).map(v => ({ value: v, description: kw.description }))
}

// suggestions lists the autocomplete entries for the term being typed. Typing
// a keyword and operator suggests values; typing a word suggests keywords and,
// in a deck search, players. Each entry is { text, description, example },
// where text replaces the term being typed.
export function suggestions(fragment, keywords, sources = {}) {
  const negate = fragment.startsWith("-") ? "-" : ""
  const parsed = parseTerm(fragment, keywords)
  if (parsed) {
    if (!parsed.keyword) {
      return []
    }
    const prefix = negate + parsed.key + parsed.op
    const typed = parsed.value.toLowerCase()

    // A color value grows a letter at a time, so offer the letters left.
    if (parsed.keyword.kind === "color" && !["m", "c"].includes(typed)) {
      return parsed.keyword.values
        .filter(v => v !== "m" && v !== "c" && !typed.includes(v))
        .map(v => ({ text: prefix + typed + v, description: `Add ${v.toUpperCase()}` }))
    }
    return valueSource(parsed.keyword, sources)
      .filter(entry => entry.value.toLowerCase().includes(typed))
      .slice(0, MAX_SUGGESTIONS)
      .map(entry => ({ text: prefix + quoted(entry.value), description: entry.description }))
  }

  const lower = fragment.toLowerCase().replace(/^-/, "")
  const matching = keywords
    .filter(kw => kw.name.startsWith(lower) || (kw.aliases || []).some(a => a.startsWith(lower)))
    .map(kw => ({ text: negate + kw.name + kw.operators[0], description: kw.description, example: kw.example }))
  if (!lower) {
    return matching
  }

  const players = (sources.playerNames || [])
    .filter(name => name.toLowerCase().includes(lower))
    .slice(0, 5)
    .map(name => ({ text: quoted(name), description: "Player" }))
  return players.concat(matching).slice(0, 12)
}

// helpText explains the value a keyword term expects, once its keyword and
// operator are typed.
export function helpText(fragment, keywords) {
  const parsed = parseTerm(fragment, keywords)
  if (!parsed || !parsed.keyword) {
    return null
  }
  const kw = parsed.keyword
  return `${kw.description} For example, ${kw.example}`
}

// searchTerms lists every term of a search, finished or still being typed.
function searchTermList(query) {
  const { pills, current } = splitPills(query)
  return current ? [...pills, current] : pills
}

// hasTerm reports whether a search holds the term as one of its terms.
export function hasTerm(query, term) {
  return searchTermList(query).includes(term)
}

// toggleTerm adds the term to a search, or takes it out if it's there. The
// result ends with a space so every term shows as a finished pill.
export function toggleTerm(query, term) {
  const terms = searchTermList(query)
  const next = terms.includes(term) ? terms.filter(t => t !== term) : [...terms, term]
  return next.length > 0 ? next.join(" ") + " " : ""
}
