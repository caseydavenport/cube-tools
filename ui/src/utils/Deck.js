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
    if (match.winner != match.opponent) {
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
    if (match.winner == match.opponent) {
      losses += 1
    }
  }
  return losses
}

// Helper function for determining if a card is within a given deck's colors.
export function InDeckColor(card, deck) {
  if (!card.types.includes("Land") && card.colors.length == 0) {
    return true
  }
  for (var k in card.colors) {
    for (var j in deck.colors) {
      if (card.colors[k] == deck.colors[j]) {
        return true
      }
    }
  }
  return false
}

