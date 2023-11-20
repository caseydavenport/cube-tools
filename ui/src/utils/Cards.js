import { IsBasicLand} from "../utils/Utils.js"
import { Wins, Losses } from "../utils/Deck.js"

// CardData returns data for each card that matches the given minimum number of drafts. The provided
// cube list is used to filter cards no longer in the cube.
export function CardData(decks, minDrafts, minGames, cube, color) {
  let tracker = {}
  let drafts = new Map()

  // Define a helper function for initializing a new empty card.
  let newCard = function(card) {
    let c = {
      name: card.name,
      mainboard: 0, // Number of times this card has been mainboarded.
      sideboard: 0, // Number of times this card has been sideboarded.
      inColorSideboard: 0, // Number of times this card was in deck color(s), and sideboarded.
      wins: 0, // Does not include sideboard.
      losses: 0, // Does not include sideboard.
      archetypes: new Map(), // Map of archetype to times played in that archetype.
      players: new Map(), // Who has played this card, and how often.
      url: card.url,
    }
    return c
  }

  // Define a helper function for determining if a card is within a given deck's colors.
  let inDeckColor = function(card, deck) {
    for (var k in card.colors) {
      for (var j in deck.colors) {
        if (card.colors[k] == deck.colors[j]) {
          return true
        }
      }
    }
    return false
  }

  // Build a map of all the cards in the cube so we can
  // easily skip any cards not currently in the cube.
  let cubeCards = new Map()
  for (var i in cube.cards) {
    cubeCards.set(cube.cards[i].name, cube.cards[i])
  }

  for (var i in decks) {
    let deck = decks[i]

    // Keep track of the total number of drafts.
    drafts.set(deck.draft, true)

    let cards = deck.mainboard
    for (var j in cards) {
      let card = cards[j]

      // First thing - skip the card if it's not currently in the cube, or if it's a basic land.
      if (!cubeCards.has(card.name)) {
        continue
      }
      if (IsBasicLand(card)) {
        continue
      }
      if (color != "") {
        let match = false
        for (var k in card.colors) {
          if (card.colors[k] == color) {
            match = true
          }
        }
        if (!match) {
          continue
        }
      }

      if (tracker[card.name] == null) {
        tracker[card.name] = newCard(card)
      }

      // Increment basic stats for this card.
      tracker[card.name].mainboard += 1
      tracker[card.name].wins += Wins(decks[i])
      tracker[card.name].losses += Losses(decks[i])

      // Increment player count.
      if (!tracker[card.name].players.has(deck.player)) {
        tracker[card.name].players.set(deck.player, 0)
      }
      tracker[card.name].players.set(deck.player, tracker[card.name].players.get(deck.player) + 1)

      // Include archetype data for this card, which allows us to map cards to archetypes
      // and compare their performance to other cards in the same archetype.
      for (var k in deck.labels) {
        const arch = deck.labels[k]
        let cardData = tracker[card.name]
        cardData.archetypes.has(arch) || cardData.archetypes.set(arch, 0)
        cardData.archetypes.set(arch, cardData.archetypes.get(arch) + 1)
      }
    }

    // Go through the sideboard and increment the counter. Not every deck has a sideboard since
    // that data isn't always collected, so this information is only partly reliable. It's still nice to see.
    for (j in deck.sideboard) {
      let card = deck.sideboard[j]

      // First thing - skip the card if it's not currently in the cube, or if it's a basic land.
      if (!cubeCards.has(card.name)) {
        continue
      }
      if (IsBasicLand(card)) {
        continue
      }
      if (color != "") {
        let match = false
        for (var k in card.colors) {
          if (card.colors[k] == color) {
            match = true
          }
        }
        if (!match) {
          continue
        }
      }

      if (tracker[card.name] == null) {
        tracker[card.name] = newCard(card)
      }
      tracker[card.name].sideboard += 1
      if (inDeckColor(card, deck)) {
        tracker[card.name].inColorSideboard += 1
      }
    }
  }

  // Convert total number of drafts.
  let totalDrafts = drafts.size


  // Calculate ELO data, which we'll merge in below.
  let eloData = ELOData(decks)

  // Convert to a list for sorting.
  let data = []
  for (var c in tracker) {
    let card = tracker[c]
    if ((card.mainboard + card.sideboard) < minDrafts) {
      // Skip any cards that haven't been picked enough - this is an approximation of
      // the number of drafts the card has appeared in. There is some fuzziness because not all drafts
      // record sideboards, and so it is possible that a card has been in more drafts than we know about.
      continue
    } else if ((card.wins + card.losses) < minGames) {
      // Filter out cards that haven't seen enough total games. This allows filtering based on the actual
      // amount of play a card may have seen, although we don't know if the card was actually ever drawn in these games.
      continue
    }
    tracker[c].pick_percent = Math.round((card.mainboard + card.sideboard) / totalDrafts * 100) // TODO: Unused
    tracker[c].mainboard_percent = Math.round(card.mainboard / totalDrafts * 100)
    tracker[c].sideboard_percent = Math.round(card.sideboard / (card.mainboard + card.sideboard) * 100)
    tracker[c].record = card.wins + "-" + card.losses + "-" + 0
    tracker[c].total_games = card.wins + card.losses
    tracker[c].elo = eloData.get(card.name).elo
    tracker[c].win_percent = 0
    if (card.wins + card.losses > 0) {
      // Calculate win percentage for cards that have been mainboarded before.
      tracker[c].win_percent = Math.round(card.wins / (card.wins + card.losses) * 100)
    }
    data.push(tracker[c])
  }
  return data
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

        // How much c1 wins is based on various criteria. i.g., it's more meaningful
        // when a card wins vs. another card of the same type, color, and CMC.
        let winValue = 1
        if (c1.cmc != c2.cmc) {
          winValue = winValue - .1
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
          winValue = winValue - .2
        }
        if (c1.types.includes("Creature") && !c2.types.includes("Creature") || !c1.types.includes("Creature") && c2.types.includes("Creature")) {
          winValue = winValue - .1
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
