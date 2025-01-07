export function Wins(deck) {
  return gameWins(deck)
}

function gameWins(deck) {
  if (deck.wins != null) {
    // Handle the legacy field, if set.
    return deck.wins
  }

  // Otherwise, return the wins based on games played.
  let wins = 0
  for (var i in deck.games) {
    let game = deck.games[i]
    if (game.winner != game.opponent) {
      wins += 1
    }
  }
  return wins
}

export function Losses(deck) {
  return gameLosses(deck)
}

function gameLosses(deck) {
  if (deck.losses != null) {
    // Handle the legacy field, if set.
    return deck.losses
  }

  // Otherwise, return the losses based on games played.
  let losses = 0
  for (var i in deck.games) {
    let game = deck.games[i]
    if (game.winner == game.opponent) {
      losses += 1
    }
  }
  return losses
}

export function MatchWins(deck) {
  if (deck.matches == null) {
    return 0
  }

  let wins = 0
  for (var i in deck.matches) {
    let match = deck.matches[i]
    if (match.winner != "" && match.winner != match.opponent) {
      wins += 1
    }
  }
  return wins
}

export function MatchLosses(deck) {
  if (deck.matches == null) {
    return 0
  }

  let losses = 0
  for (var i in deck.matches) {
    let match = deck.matches[i]
    if (match.winner != "" && match.winner == match.opponent) {
      losses += 1
    }
  }
  return losses
}

export function MatchDraws(deck) {
  if (deck.matches == null) {
    return 0
  }

  let draws = 0
  for (var i in deck.matches) {
    let match = deck.matches[i]
    if (match.winner == "") {
      draws += 1
    }
  }
  return draws
}

// Helper function for determining if a card is within a given deck's colors.
export function InDeckColor(card, deck) {
  if (!card.colors) {
    return true
  }
  if (!card.types.includes("Land") && card.colors.length == 0) {
    return true
  }

  // For most cards, use the card's colors to determine if it's in the deck.
  // For lands, use the color identity of the card (since lands don't have colors, but do have color identity).
  let colors = card.colors
  if (card.types.includes("Land")) {
    colors = card.color_identity
  }

  // Only return true if all of the card's colors are in the deck's colors.
  let deckLookup = new Map()
  for (let deckColor of deck.colors) {
    deckLookup.set(deckColor, true)
  }
  for (let cardColor of colors) {
    if (!deckLookup.has(cardColor)) {
      return false
    }
  }
  return true
}

