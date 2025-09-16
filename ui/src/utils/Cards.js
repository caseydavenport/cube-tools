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

function ELOData(decks) {
  let cards = new Map()

  for (let d of decks) {
    // Populate the cards map with initial ELO data.
    for (let card of d.mainboard) {
      if (!cards.has(card.name)) {
        card.elo = 1200
        card.diff = 0
        cards.set(card.name, card)
      }
    }
    for (let card of d.sideboard) {
      if (!cards.has(card.name)) {
        card.elo = 1200
        card.diff = 0
        cards.set(card.name, card)
      }
    }
  }

  // Go through each deck and perform ELO calculations on the cards.
  // We create a "match" between each mainboarded card and each sideboarded card.
  for (let deck of decks) {
    for (let c1 of deck.mainboard) {
      if (IsBasicLand(c1)) {
        continue
      }

      for (let c2 of deck.sideboard) {
        if (IsBasicLand(c2)) {
          continue
        }

        // Skip sideboard cards that just don't match the deck's colors. These shouldn't be
        // penalized since they don't have any place in the deck.
        if (!InDeckColor(c2, deck)) {
          continue
        }

        // How much c1 wins is based on various criteria. i.e., it's more meaningful
        // when a card wins vs. another card of the same type, color, and CMC.
        let winValue = 1
        if (c1.cmc != c2.cmc) {
          // More meaningful the closer the cards are in CMC, since they are more likely
          // competing for the same slot in the deck.
          winValue = winValue - .025*Math.abs(c1.cmc - c2.cmc)
        }

        // This treats colorless cards as matching, which is fair enough given what we're really
        // testing is how much c1 and c2 are competing for the same slot.
        let colorMatch = true
        if (c1.colors != null && c2.colors != null) {
          for (let color of c1.colors) {
            for (let color2 of c2.colors) {
              if (!c1.colors.includes(color2) || !c2.colors.includes(color)) {
                colorMatch = false
              }
            }
          }
        }
        if (!colorMatch) {
          winValue = winValue - .05
        }

        // Creature vs. Creature counts more than creature vs. noncreature. This is all of course a rough appoximation.
        if (c1.types.includes("Creature") && !c2.types.includes("Creature") || !c1.types.includes("Creature") && c2.types.includes("Creature")) {
          winValue = winValue - .1
        }

        // The mainboarded card should always win, so limit the winValue to .55
        if (winValue < .55) {
          winValue = .55
        }


        // Fetch the canonical card for each.
        let cc1 = cards.get(c1.name)
        let cc2 = cards.get(c2.name)

        // Transform their current ELO rating.
        let r1 = Math.pow(10, cc1.elo/400)
        let r2 = Math.pow(10, cc2.elo/400)

        // Calculate expected outcome.
        let e1 = r1 / (r1 + r2)
        let e2 = r2 / (r1 + r2)

        // Calculate the score for the matchup.
        let s1 = winValue
        let s2 = 1-winValue

        // Calculate new rankings for each card. K determines how much a match
        // impacts the ranking change. In general, we want the impact of a single comparison to be small
        // because we don't want to jump to conclusions over a single card inclusion / exclusion.
        let k = 16
        cc1.diff += k * (s1 - e1)
        cc2.diff += k * (s2 - e2)
      }
    }

    // Update the cards actual ELO after each deck, and reset the diff for the next.
    for (let c1 of deck.mainboard) {
      cards.get(c1.name).elo += Math.round(cards.get(c1.name).diff)
      cards.get(c1.name).diff = 0
    }
    for (let c2 of deck.sideboard) {
      cards.get(c2.name).elo += Math.round(cards.get(c2.name).diff)
      cards.get(c2.name).diff = 0
    }

  }
  return cards
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

export function CardAnalyze(card, playerData) {
  let total_picks = 0

  // expected_rate is the expected performance of the card based on the players who have played this card. A higher value means
  // that this card is played on average by players who win more.
  let expected_rate = 0

  let play_count = 0

  let players = Object.entries(card.players)
  for (let [player, count] of players) {
    if (!playerData.has(player)) {
      console.log("Missing player data for " + player)
      continue
    }
    expected_rate += count * playerData.get(player).winPercent / 100
    play_count += count
  }
  if (play_count > 0) {
    expected_rate = Math.round(100 * expected_rate / play_count) / 100

    // Convert to a percentage to display in the UI.
    expected_rate = Math.round(expected_rate * 100)
  }

  return [expected_rate]
}
