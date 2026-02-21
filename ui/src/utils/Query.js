import { CombineColors } from "../utils/Colors.js"


export const QueryTerms = [
  "pow",
  "name",
  "o",
  "color",
  "t",
  "cmc",
  "games",
  "mb",
  "sb",
  "players",
  "drafts",
  "winpct",
]

export const QueryTermMetadata = [
  { term: "color", description: "Card color", operators: [":", "=", "!="], valueType: "color", example: "color:ug", values: ["w", "u", "b", "r", "g"] },
  { term: "cmc", description: "Mana value", operators: ["<", ">", "="], valueType: "number", example: "cmc<3" },
  { term: "t", description: "Card type", operators: [":"], valueType: "text", example: "t:creature" },
  { term: "o", description: "Oracle text", operators: [":"], valueType: "text", example: "o:flying" },
  { term: "name", description: "Card name", operators: [":"], valueType: "text", example: "name:bolt" },
  { term: "pow", description: "Power", operators: ["<", ">", "="], valueType: "number", example: "pow>3" },
  { term: "games", description: "Total games played", operators: ["<", ">"], valueType: "number", example: "games>5" },
  { term: "mb", description: "Mainboard count", operators: ["<", ">", "="], valueType: "number", example: "mb>0" },
  { term: "sb", description: "Sideboard count", operators: ["<", ">", "="], valueType: "number", example: "sb>0" },
  { term: "players", description: "Number of drafters", operators: ["<", ">", "=", ":"], valueType: "number", example: "players>2" },
  { term: "drafts", description: "Number of drafts", operators: ["<", ">", "="], valueType: "number", example: "drafts>3" },
  { term: "winpct", description: "Win percentage", operators: ["<", ">", "="], valueType: "number", example: "winpct>50" },
  { term: "arch", description: "Deck archetype", operators: [":"], valueType: "text", example: "arch:aggro" },
  { term: "minCards", description: "Min matching cards", operators: [":"], valueType: "number", example: "minCards:3" },
]

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
    if (splits.some(term => isColorTerm(term))) {
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

    // Check if the cmc terms match.
    if (splits.some(term => isCMCTerm(term))) {
      if (!cmcsMatch(splits, card)) {
        return false
      }
    }

    // Check if the # games queries match.
    if (splits.some(term => isGamesTerm(term))) {
      if (!gamesMatch(splits, card)) {
        return false
      }
    }

    // Check if mainboard queries match.
    if (splits.some(term => isMainboardTerm(term))) {
      if (!mainboardsMatch(splits, card)) {
        return false
      }
    }

    // Check if sideboard queries match.
    if (splits.some(term => isSideboardTerm(term))) {
      if (!sideboardsMatch(splits, card)) {
        return false
      }
    }


    // Check if # drafts queries match.
    if (splits.some(term => isDraftsTerm(term))) {
      if (!draftsTermsMatch(splits, card)) {
        return false
      }
    }

    // Check if the # of players queries match.
    if (splits.some(term => isPlayersTerm(term))) {
      if (!playersTermsMatch(splits, card)) {
        return false
      }
    }

    // Win percentage queries.
    if (splits.some(term => isWinPercentageTerm(term))) {
      if (!winPercentagesMatch(splits, card)) {
        return false
      }
    }

    // All terms matched.
    return true
  }

  if (card.name.toLowerCase().match(matchStr.toLowerCase())) {
    return true
  }
  if (checkText && card.oracle_text) {
    if (card.oracle_text.toLowerCase().match(matchStr.toLowerCase())) {
      return true
    }
  }
  return false
}

// Return the minimum required cards that mush match the given match string
// for a deck to be considered a match.
function minRequiredCardMatches(matchStr) {
  let count = 0
  let splits = parseTerms(matchStr)
  for (let term of splits) {
    if (term.startsWith("minCards:")) {
      let val = parseInt(term.replace("minCards:", ""))
      if (!isNaN(val)) {
        count = val
      }
    }
  }
  return count
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

  // Check deck types.
  let splits = parseTerms(matchStr)
  if (splits.some(term => isDeckTypeTerm(term))) {
    if (deckTypesMatch(splits, deck)) {
      return true
    }
  }


  let minCards = minRequiredCardMatches(matchStr)
  let matchCount = 0

  // Check mainboard / sideboard.
  if (mbsb == "Mainboard") {
    for (let card of deck.mainboard) {
      if (CardMatches(card, matchStr, true)) {
        matchCount++
        if (matchCount >= minCards) {
          return true
        }
      }
    }
  } else if (mbsb == "Sideboard") {
    for (let card of deck.sideboard) {
      if (CardMatches(card, matchStr, true)) {
        matchCount++
        if (matchCount >= minCards) {
          return true
        }
      }
    }
  } else if (deck.pool) {
    for (let card of deck.pool) {
      if (CardMatches(card, matchStr, true)) {
        matchCount++
        if (matchCount >= minCards) {
          return true
        }
      }
    }
  }

  return false
}

export function parseTerms(matchStr) {
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
export function isTermQuery(matchStr) {
  // Split the string. If any of the criteria are query terms, return true.
  let splits = matchStr.split(" ")
  for (let term of splits) {
    for (let qt of QueryTerms) {
      if (term.startsWith(qt) && (term.includes("<") || term.includes(">") || term.includes("=") || term.includes(":"))) {
        // It's a term query.
        return true
      }
    }
  }
  return false
}

function isGamesTerm(term) {
  return term.startsWith("games")
}

function gamesMatch(terms, card) {
  for (let term of terms) {
    if (!isGamesTerm(term)) {
      continue
    }
    if (gameMatches(term, card)) {
      return true
    }
  }
  return false
}

function gameMatches(term, card) {
  if (!isGamesTerm(term)) {
    return true
  }

  // If the card has no games, it can't match.
  if (card.total_games === null) {
    return false
  }

  // Handle gt and lt queries.
  if (term.startsWith("games<")) {
    let val = parseInt(term.replace("games<", ""))
    if (card.total_games < val) {
      return true
    }
  }
  if (term.startsWith("games>")) {
    let val = parseInt(term.replace("games>", ""))
    if (card.total_games > val) {
      return true
    }
  }
  return false
}

function isMainboardTerm(term) {
  return term.startsWith("mb")
}

function mainboardsMatch(terms, card) {
  for (let term of terms) {
    if (!isMainboardTerm(term)) {
      continue
    }
    if (mainboardMatches(term, card)) {
      return true
    }
  }
  return false
}

function mainboardMatches(term, card) {
  if (!isMainboardTerm(term)) {
    return true
  }
  if (card.mainboard === null) {
    return false
  }

  if (term.startsWith("mb<")) {
    let val = parseInt(term.replace("mb<", ""))
    if (card.mainboard < val) {
      return true
    }
  }
  if (term.startsWith("mb>")) {
    let val = parseInt(term.replace("mb>", ""))
    if (card.mainboard > val) {
      return true
    }
  }
  if (term.startsWith("mb=")) {
    let val = parseInt(term.replace("mb=", ""))
    return card.mainboard === val
  }
}

function isSideboardTerm(term) {
  return term.startsWith("sb")
}

function sideboardsMatch(terms, card) {
  for (let term of terms) {
    if (!isSideboardTerm(term)) {
      continue
    }
    if (sideboardMatches(term, card)) {
      return true
    }
  }
  return false
}

function sideboardMatches(term, card) {
  if (!isSideboardTerm(term)) {
    return true
  }
  if (card.sideboard == null) {
    return false
  }

  if (term.startsWith("sb<")) {
    let val = parseInt(term.replace("sb<", ""))
    if (card.sideboard < val) {
      return true
    }
  }
  if (term.startsWith("sb>")) {
    let val = parseInt(term.replace("sb>", ""))
    if (card.sideboard > val) {
      return true
    }
  }
  if (term.startsWith("sb=")) {
    let val = parseInt(term.replace("sb=", ""))
    return card.sideboard === val
  }
}

function isDraftsTerm(term) {
  return term.startsWith("drafts")
}

function draftsTermsMatch(terms, card) {
  for (let term of terms) {
    if (!isDraftsTerm(term)) {
      continue
    }
    if (!draftTermMatches(term, card)) {
      return false
    }
  }
  return true
}

function draftTermMatches(term, card) {
  if (!isDraftsTerm(term)) {
    return true
  }
  if (card.drafts === null) {
    return false
  }

  if (term.startsWith("drafts<")) {
    let val = parseInt(term.replace("drafts<", ""))
    if (card.drafts < val) {
      return true
    }
  }
  if (term.startsWith("drafts>")) {
    let val = parseInt(term.replace("drafts>", ""))
    if (card.drafts > val) {
      return true
    }
  }
  if (term.startsWith("drafts=")) {
    let val = parseInt(term.replace("drafts=", ""))
    return card.drafts === val
  }
}

function isPlayersTerm(term) {
  return term.startsWith("players")
}

function playersTermsMatch(terms, card) {
  for (let term of terms) {
    if (!isPlayersTerm(term)) {
      continue
    }
    if (!playerTermMatches(term, card)) {
      return false
    }
  }
  return true
}

function playerTermMatches(term, card) {
  if (!isPlayersTerm(term)) {
    return true
  }
  if (card.players == null) {
    return false
  }

  let count = Object.entries(card.players).length

  if (term.startsWith("players<")) {
    let val = parseInt(term.replace("players<", ""))
    if (count < val) {
      return true
    }
  }
  if (term.startsWith("players>")) {
    let val = parseInt(term.replace("players>", ""))
    if (count > val) {
      return true
    }
  }
  if (term.startsWith("players=")) {
    let val = parseInt(term.replace("players=", ""))
    return count === val
  }

  // A special ":" term for matching on a specific player name.
  if (term.startsWith("players:")) {
    let val = term.replace("players:", "")
    if (card.players[val]) {
      return true
    }
  }
  return false
}

function isWinPercentageTerm(term) {
  return term.startsWith("winpct")
}

function winPercentagesMatch(terms, card) {
  for (let term of terms) {
    if (!isWinPercentageTerm(term)) {
      continue
    }
    if (!winPercentageMatches(term, card)) {
      return false
    }
  }
  return true
}

function winPercentageMatches(term, card) {
  if (!isWinPercentageTerm(term)) {
    return true
  }
  if (card.win_percent == null) {
    return false
  }

  let cardVal = card.win_percent

  if (term.startsWith("winpct<")) {
    let val = parseInt(term.replace("winpct<", ""))
    if (cardVal < val) {
      return true
    }
  }
  if (term.startsWith("winpct>")) {
    let val = parseInt(term.replace("winpct>", ""))
    if (cardVal > val) {
      return true
    }
  }
  if (term.startsWith("winpct=")) {
    let val = parseInt(term.replace("winpct=", ""))
    return cardVal === val
  }
  return false
}

function isCMCTerm(term) {
  return term.startsWith("cmc")
}

function cmcsMatch(terms, card) {
  for (let term of terms) {
    if (!isCMCTerm(term)) {
      continue
    }
    if (cmcMatches(term, card)) {
      return true
    }
  }
  return false
}

function cmcMatches(term, card) {
  if (!isCMCTerm(term)) {
    // Not a cmc query - always matches.
    return true
  }

  // If the card has no cmc, it can't match.
  if (card.cmc == null) {
    return false
  }

  let cmc = parseInt(card.cmc)
  if (isNaN(cmc)) {
    return false
  }

  // If the term is a cmc query, we need to check if the card's cmc matches.
  if (term.startsWith("cmc<")) {
    let val = parseInt(term.replace("cmc<", ""))
    if (cmc < val) {
      return true
    }
  }
  if (term.startsWith("cmc>")) {
    let val = parseInt(term.replace("cmc>", ""))
    if (cmc > val) {
      return true
    }
  }
  if (term.startsWith("cmc=")) {
    let val = parseInt(term.replace("cmc=", ""))
    if (cmc == val) {
      return true
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
  return term.startsWith("color:") || term.startsWith("color=") || term.startsWith("color!=")
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
  // e.g., "color!=uw" means the card is not exactly blue and white.
  if (term.includes("!=")) {
    let query = term.replace("color!=", "").toLowerCase()
    if (query != cardColors) {
      return true
    }
    return false
  }

  // "=" means "exactly the given colors".
  // e.g., "color=uw" means the card is exactly blue and white.
  if (term.includes("=")) {
    let query = term.replace("color=", "").toLowerCase()
    if (query == cardColors) {
      return true
    }
    return false
  }

  // ":" means "contains the given colors".
  // e.g., "color:uw" means the card contains both blue and white.
  // "color:u" means the card contains blue.
  let query = term.replace("color:", "").toLowerCase()

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

function isDeckTypeTerm(term) {
  return term.startsWith("arch:") || term.startsWith("arch!=")
}

function deckTypesMatch(terms, deck) {
  for (let term of terms) {
    if (!isDeckTypeTerm(term)) {
      continue
    }
    if (deckTypeMatches(term, deck)) {
      return true
    }
  }
  return false
}

function deckTypeMatches(term, deck) {
  if (!isDeckTypeTerm(term)) {
    // Not a deck type query - always matches.
    return true
  }

  // Remove the arch: prefix and any quotes.
  let query = term.replace("arch:", "").replace(/"/g, "").toLowerCase()

  // Return true if any of the deck's types match the query.
  if (deck.labels.some(t => t.toLowerCase() == query)) {
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
