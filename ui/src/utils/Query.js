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

  if (mbsb == "Mainboard") {
    for (let card of deck.mainboard) {
      if (CardMatches(card, matchStr, true)) {
        return true
      }
    }
  } else {
    for (let card of deck.sideboard) {
      if (CardMatches(card, matchStr, true)) {
        return true
      }
    }
  }

  return false
}

const queryTerms = ["pow", "o", "c"]

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

function colorsMatch(terms, card) {
  for (let term of terms) {
    if (!term.startsWith("c:") && !term.startsWith("c=")) {
      continue
    }
    if (colorMatches(term, card)) {
      return true
    }
  }
  return false
}

function colorMatches(term, card) {
  if (!term.startsWith("c:") && !term.startsWith("c=")) {
    // Not a color query - always matches.
    return true
  }

  // If the card has no colors, it can't match.
  if (!card.colors || card.colors.length == 0) {
    return false
  }
  let cardColors = CombineColors(card.colors).toLowerCase()

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

