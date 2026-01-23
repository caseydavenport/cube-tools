export function Wins(deck) {
  return gameWins(deck)
}

function gameWins(deck) {
  return deck.stats.game_wins
}

export function Losses(deck) {
  return gameLosses(deck)
}

function gameLosses(deck) {
  return deck.stats.game_losses
}

export function Draws(deck) {
  return deck.stats.game_draws
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
  return deck.stats.match_wins
}

export function MatchLosses(deck) {
  return deck.stats.match_losses
}

// A deck gets a trophy if it has at least 3 match wins without a match loss.
export function Trophies(deck) {
  return deck.stats.trophies
}

// A deck comes in last place if it has no wins, and at least three losses.
export function LastPlaceFinishes(deck) {
  return deck.stats.last_place
}

// Record is 2-1 or better in matches.
export function Winning(deck) {
  if (MatchWins(deck) >=2 && MatchLosses(deck) < 2) {
    return 1
  }
  return 0
}

// Record is 1-2 or worse in matches.
export function Losing(deck) {
  if (MatchLosses(deck) >=2 && MatchWins(deck) < 2) {
    return 1
  }
  return 0
}

export function MatchDraws(deck) {
  return deck.stats.match_draws
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

