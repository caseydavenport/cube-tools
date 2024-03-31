export function Wins(deck) {
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
