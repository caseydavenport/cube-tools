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
    if (game.winner != "" && game.winner != game.opponent) {
      wins += 1
    }
  }
  return wins
}

export function Losses(deck) {
  return gameLosses(deck)
}

export function Draws(deck) {
  let draws = 0
  for (var i in deck.games) {
    let game = deck.games[i]
    if (game.winner == "") {
      draws += 1
    }
  }
  return draws
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
    if (game.winner != "" && game.winner == game.opponent) {
      losses += 1
    }
  }
  return losses
}

export function Record(deck, opp) {
  let wins = 0
  let losses = 0
  let ties = 0

  for (var i in deck.games) {
    let game = deck.games[i]

    // Skip games that don't match this opponent.
    if (game.opponent.toLowerCase() != opp.toLowerCase()) {
      continue
    }

    // Count up wins / losses.
    if (game.winner == "") {
      ties += 1
    } else if (game.winner == game.opponent) {
      losses += 1
    } else {
      wins += 1
    }
  }

  return wins + "-" + losses + (ties > 0 ? "-" + ties : "")
}

export function MatchWins(deck) {
  if (deck.match_wins_override != null) {
    return deck.match_wins_override
  }
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
  if (deck.match_losses_override != null) {
    return deck.match_losses_override
  }

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

// A deck gets a trophy if it has at least 3 match wins without a match loss.
export function Trophies(deck) {
  if (MatchWins(deck) >= 3 && MatchLosses(deck) == 0) {
    return 1;
  }
  return 0
}

// A deck comes in last place if it has no wins, and at least three losses.
export function LastPlaceFinishes(deck) {
  if (MatchWins(deck) == 0 && MatchLosses(deck) >= 3) {
    return 1;
  }
  return 0;
}

// Return 1 if this deck lost more than it won (in matches)
export function Winning(deck) {
  if (MatchWins(deck) > MatchLosses(deck)) {
    return 1
  }
  return 0
}

// Return 1 if this deck won more than (or equal to) losses (in matches)
export function Losing(deck) {
  if (Winning(deck) > 0) {
    return 0
  }
  return 1
}

export function MatchDraws(deck) {
  if (deck.match_draws_override != null) {
    return deck.match_draws_override
  }

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

