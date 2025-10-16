import { IsBasicLand} from "../utils/Utils.js"
import { Trophies, LastPlaceFinishes, Wins, Losses, InDeckColor } from "../utils/Deck.js"
import { RemovalMatches, CounterspellMatches } from "../pages/Decks.js"

export function IsInteraction(card) {
  for (let match of RemovalMatches.concat(CounterspellMatches)) {
    if (card.oracle_text.toLowerCase().match(match)){
      return true
    }
  }
  return false
}

function IsCounterspell(card) {
  for (let match of CounterspellMatches) {
    if (card.oracle_text.toLowerCase().match(match)){
      return true
    }
  }
  return false
}

function IsRemoval(card) {
  for (let match of RemovalMatches) {
    if (card.oracle_text.toLowerCase().match(match)){
      return true
    }
  }
  return false
}

function IsLand(card) {
  if (card.types && card.types.includes("Land")) {
    return true
  }
  return false
}

function compareDates(dateString1, dateString2) {
    const date1 = new Date(dateString1);
    const date2 = new Date(dateString2);

    if (isNaN(date1) && !isNaN(date2)) {
      return dateString2
    } else if (isNaN(date2) && !isNaN(date1)) {
      return dateString1
    } else if (isNaN(date2) && isNaN(date1)) {
      console.log("Invalid date format")
      return ""
    }

    if (date1 > date2) {
        return dateString1;
    } else if (date2 > date1) {
        return dateString2;
    } else {
      return dateString1
    }
}
