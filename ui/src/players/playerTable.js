// The Players table's ordering: which value each column sorts on, and the
// default order by matches played. Kept free of React so it's unit-tested.

// playerSortValue is the value a player row sorts on for a column. Matches is
// the default, since win rates can't yet tell players apart.
function playerSortValue(row, sortBy) {
  switch (sortBy) {
    case "name": return row.name
    case "num_decks": return row.num_decks
    case "games": return row.games
    case "win_percent": return row.bayesian_win_percent
    case "trophies": return row.trophies
    case "last_place": return row.last_place
    case "opponent_win_percentage": return row.opponent_win_percentage
    default: return row.tendencies ? row.tendencies.matches : 0
  }
}

// compareValues orders two sort values: names A to Z, numbers highest first.
function compareValues(a, b) {
  if (typeof a === "string") {
    return a.localeCompare(b)
  }
  if (a > b) {
    return -1
  }
  if (a < b) {
    return 1
  }
  return 0
}

// sortPlayerRows returns a sorted copy of the player rows for the column
// sortBy ("" means matches). Ties go to more drafts, then name, whichever way
// the column runs; invert reverses the column's own order.
export function sortPlayerRows(rows, sortBy, invert) {
  return [...rows].sort((a, b) => {
    let cmp = compareValues(playerSortValue(a, sortBy), playerSortValue(b, sortBy))
    if (invert) {
      cmp = -cmp
    }
    if (cmp !== 0) {
      return cmp
    }
    if (a.num_decks !== b.num_decks) {
      return b.num_decks - a.num_decks
    }
    return a.name.localeCompare(b.name)
  })
}
