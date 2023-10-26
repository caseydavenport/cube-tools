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
    tracker[c].win_percent = 0
    if (card.wins + card.losses > 0) {
      // Calculate win percentage for cards that have been mainboarded before.
      tracker[c].win_percent = Math.round(card.wins / (card.wins + card.losses) * 100)
    }
    data.push(tracker[c])
  }
  return data
}

