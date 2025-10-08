import { CombineColors } from "../utils/Colors.js"

export function CardMatches(card, matchStr, checkText) {
  if (isTermQuery(matchStr)) {
    // This is a fuzzy match. Split the string and check each term.
    let splits = parseTerms(matchStr)

    // Check if any oracle terms match.
    if (splits.some(term => term.startsWith("o:"))) {
      // If there are oracle terms, we need to match at least one of them.
      if (!oraclesMatch(splits, card)) {
        return false
      }
    }

    // Check if any power terms match.
    if (splits.some(term => term.startsWith("pow"))) {
      // If there are power terms, we need to match at least one of them.
      if (!powersMatch(splits, card)) {
        return false
      }
    }

    // Check if any color terms match.
    if (splits.some(term => term.startsWith("c"))) {
      // If there are color terms, we need to match at least one of them.
      if (!colorsMatch(splits, card)) {
        return false
      }
    }

    // Check if any type terms match.
    if (splits.some(term => isTypeTerm(term))) {
      // If there are type terms, we need to match at least one of them.
      if (!typesMatch(splits, card)) {
        return false
      }
    }

    // Check if any name terms match.
    if (splits.some(term => isNameTerm(term))) {
      // If there are name terms, we need to match at least one of them.
      if (!namesMatch(splits, card)) {
        return false
      }
    }

    // All terms matched.
    return true
  }

  if (card.name.toLowerCase().match(matchStr.toLowerCase())) {
    return true
  }
  if (checkText) {
    if (card.oracle_text.toLowerCase().match(matchStr.toLowerCase())) {
      return true
    }
  }
  return false
}

export function DeckMatches(deck, matchStr, mbsb) {
  if (deck.player.toLowerCase().match(matchStr.toLowerCase())) {
    return true
  }

  for (let label of deck.labels) {
    if (label.toLowerCase().match(matchStr.toLowerCase())) {
      return true
    }
  }

  // Check mainboard / sideboard.
  if (mbsb == "Mainboard") {
    for (let card of deck.mainboard) {
      if (CardMatches(card, matchStr, true)) {
        return true
      }
    }
  } else if (mbsb == "Sideboard") {
    for (let card of deck.sideboard) {
      if (CardMatches(card, matchStr, true)) {
        return true
      }
    }
  } else if (deck.pool) {
    for (let card of deck.pool) {
      if (CardMatches(card, matchStr, true)) {
        return true
      }
    }
  }

  return false
}

const queryTerms = ["pow", "name", "o", "c", "t"]

function parseTerms(matchStr) {
  // Split the string into terms. A term ends at a space, unless the space is inside quotes.
  let terms = []
  let currentTerm = ""
  let inQuotes = false
  for (let char of matchStr) {
    if (char == '"') {
      inQuotes = !inQuotes
      currentTerm += char
    } else if (char == " " && !inQuotes) {
      if (currentTerm.length > 0) {
        terms.push(currentTerm)
        currentTerm = ""
      }
    } else {
      currentTerm += char
    }
  }
  if (currentTerm.length > 0) {
    terms.push(currentTerm)
  }
  return terms
}

// returns true if this is a proper term query match, and false otherwise.
function isTermQuery(matchStr) {
  // Split the string. If any of the criteria are query terms, return true.
  let splits = matchStr.split(" ")
  for (let term of splits) {
    for (let qt of queryTerms) {
      if (term.startsWith(qt) && (term.includes("<") || term.includes(">") || term.includes("=") || term.includes(":"))) {
        // It's a term query.
        return true
      }
    }
  }
  return false
}

function isNameTerm(term) {
  return term.startsWith("name:")
}

function nameMatches(term, card) {
  if (!isNameTerm(term)) {
    // Not a name query - always matches.
    return true
  }

  // Remove the name: prefix and any quotes.
  let query = term.replace("name:", "").replace(/"/g, "").toLowerCase()
  if (card.name.toLowerCase().match(query)) {
    return true
  }
  return false
}

function namesMatch(terms, card) {
  for (let term of terms) {
    if (!isNameTerm(term)) {
      continue
    }
    if (nameMatches(term, card)) {
      return true
    }
  }
  return false
}

function colorsMatch(terms, card) {
  for (let term of terms) {
    if (!isColorTerm(term)) {
      continue
    }
    if (colorMatches(term, card)) {
      return true
    }
  }
  return false
}

function isColorTerm(term) {
  return term.startsWith("c:") || term.startsWith("c=") || term.startsWith("c!=")
}

function colorMatches(term, card) {
  if (!isColorTerm(term)) {
    // Not a color query - always matches.
    return true
  }

  // If the card has no colors, it can't match.
  if (!card.colors || card.colors.length == 0) {
    return false
  }
  let cardColors = CombineColors(card.colors).toLowerCase()

  // "!=" means "not exactly the given colors".
  // e.g., "c!=uw" means the card is not exactly blue and white.
  if (term.includes("!=")) {
    let query = term.replace("c!=", "").toLowerCase()
    if (query != cardColors) {
      return true
    }
    return false
  }

  // "=" means "exactly the given colors".
  // e.g., "c=uw" means the card is exactly blue and white.
  if (term.includes("=")) {
    let query = term.replace("c=", "").toLowerCase()
    if (query == cardColors) {
      return true
    }
    return false
  }

  // ":" means "contains the given colors".
  // e.g., "c:uw" means the card contains both blue and white.
  // "c:u" means the card contains blue.
  let query = term.replace("c:", "").toLowerCase()

  // True if all of the colors are included in the card's colors.
  if (query.split("").every(c => cardColors.includes(c))) {
    return true
  }
  return false
}

function powMatches(term, card) {
  if (!term.startsWith("pow")) {
    // Not a power query - always matches.
    return true
  }

  // If the card has no power, it can't match.
  if (card.power == null) {
    return false
  }

  // Parse the power string as an int.
  let power = parseInt(card.power)
  if (isNaN(power)) {
    return false
  }

  // If the term is a power query, we need to check if the card's power matches.
  if (term.startsWith("pow<")) {
    let val = parseInt(term.replace("pow<", ""))
    if (power < val) {
      return true
    }
  }
  if (term.startsWith("pow>")) {
    let val = parseInt(term.replace("pow>", ""))
    if (power > val) {
      return true
    }
  }
  if (term.startsWith("pow=")) {
    let val = parseInt(term.replace("pow=", ""))
    if (power == val) {
      return true
    }
  }
  return false
}

// Check if any of the oracle terms match, and return true if they do.
function oraclesMatch(terms, card) {
  for (let term of terms) {
    if (!term.startsWith("o:")) {
      continue
    }

    if (oracleMatches(term, card)) {
      return true
    }
  }
  return false
}

function powersMatch(terms, card) {
  for (let term of terms) {
    if (!term.startsWith("pow")) {
      continue
    }
    if (powMatches(term, card)) {
      return true
    }
  }
  return false
}

function oracleMatches(term, card) {
  if (!term.startsWith("o:")) {
    // Not an oracle query - always matches.
    return true
  }

  // Remove the o: prefix and any quotes.
  let query = term.replace("o:", "").replace(/"/g, "").toLowerCase()
  if (card.oracle_text.toLowerCase().match(query)) {
    return true
  }
  return false
}

function isTypeTerm(term) {
  return term.startsWith("t:") || term.startsWith("t!=")
}

function typesMatch(terms, card) {
  for (let term of terms) {
    if (!isTypeTerm(term)) {
      continue
    }
    if (typeMatches(term, card)) {
      return true
    }
  }
  return false
}

function typeMatches(term, card) {
  if (!isTypeTerm(term)) {
    // Not a type query - always matches.
    return true
  }

  // Remove the t: prefix and any quotes.
  let query = term.replace("t:", "").replace(/"/g, "").toLowerCase()
  // Return true if any of the card's types match the query.

  if (card.types.some(t => t.toLowerCase() == query)) {
    return true
  }

  return false
}
