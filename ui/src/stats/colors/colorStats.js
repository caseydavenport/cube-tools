// Color stats worked out in the browser from a list of decks.

import { GetColorIdentity, primaryColorPair } from "../../utils/Colors.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../../utils/Deck.js"
import { AverageWordCount, CountManaPips, IsBasicLand, Pct } from "../../utils/Utils.js"

// GetColorStats collects statistics aggregated by color and color pair based on the given decks.
//
// Duplicates the server-side logic in pkg/server/stats/colors.go. We need
// the client-side copy because per-player color breakdowns (Players.js) and
// live re-filtering by color checkboxes / match string (StatsHooks.js)
// recompute without a server round-trip. Keep the two in sync.
//
// TODO: add a server endpoint that takes those extra filter axes and delete
// this function.
export function GetColorStats(decks, colorMode) {
  let tracker = new Map()

  // Count of all cards ever drafted. This will be used to calculate pick percentages per-color.
  let totalCards = 0

  // Function for initializing an empty color.
  let newColor = function(color) {
    return {
      color: color,

      // Number of game wins, losses.
      wins: 0,
      losses: 0,

      // Number of cards of this color.
      cards: 0,

      // Track the number of 3-0 and 0-3 decks.
      trophies: 0,
      last_place: 0,

      // Each element represents a deck, with value equal to the
      // percentage of cards in that deck with this color.
      deck_percentages: [],

      // The average percentage of non-land cards in a deck that are this color.
      average_deck_percentage: 0,

      // The percentage of all drafted cards that are this color.
      total_pick_percentage: 0,

      // Win percentage of decks including this color.
      win_percent: 0,

      // Percentage of all decks that have included this color.
      build_percent: 0,

      // Total number of decks that included this color.
      num_decks: 0,

      // Fractional number of wins attributed to this color based on deck composition across
      // all decks in the timeframe.
      victory_points: 0,

      // Number of victory points that this color could have achieved, if it had won every game.
      available_victory_points: 0,

      // Each entry represents the contribution of a particular deck.
      victory_points_per_deck: [],

      // Average word count per non-land card.
      avg_word_count: 0,
      word_count_sum: 0,
      word_count_count: 0,
    }
  }

  for (var i in decks) {
    // Start by adding metrics at the deck scope for color identity.
    // Add wins and losses contributed for each color / color combination within this deck.
    let colorIdentity = GetColorIdentity(decks[i])

    // In "inclusive" mode, a deck contributes to all sub-identities (W, U, WU for a WU deck).
    // In "exact" mode, only the exact color identity matches (WU only).
    // In "primary" mode, same as exact but 3+ color decks with a clear primary pair
    // (splash colors) are treated as their primary pair.
    let strict = colorMode === "exact" || colorMode === "primary"
    let primaryPair = null
    if (colorMode === "primary" && decks[i].colors.length >= 3) {
      let pair = primaryColorPair(decks[i])
      if (pair != null) {
        primaryPair = pair[0] + pair[1]
      }
    }
    let colors = new Array()
    if (primaryPair != null) {
      // 3+ color deck with a clear primary pair: contribute only to that
      // pair, not to every 2-char sub-identity (which would triple-count a
      // WUG-with-WU-primary deck into WU, WG, and UG).
      colors.push(primaryPair)
    } else {
      let effectiveColorCount = decks[i].colors.length
      for (let color of colorIdentity) {
        if (strict && effectiveColorCount != color.length) {
          continue
        }
        colors.push(color)
      }
    }

    for (var j in colors) {
      let color = colors[j]

      if (!tracker.has(color)) {
        tracker.set(color, newColor(color))
      }
      tracker.get(color).wins += Wins(decks[i])
      tracker.get(color).losses += Losses(decks[i])
      tracker.get(color).trophies += Trophies(decks[i])
      tracker.get(color).last_place += LastPlaceFinishes(decks[i])
      tracker.get(color).num_decks += 1

      let avgWC = AverageWordCount({deck: decks[i]})
      if (avgWC !== null) {
        tracker.get(color).word_count_sum += avgWC
        tracker.get(color).word_count_count += 1
      }
    }

    // Add metrics to the color based on card scope statistics.
    // Calculate the total number of cards drafted of the color across
    // all drafts, as well as the percentage of that color within the deck, which we'll
    // use to calculate an indicator of which colors are primary and which are splashed.
    let totalCardsInDeck = 0
    for (let card of decks[i].mainboard) {
      // Skip basic lands, since they just dilute the percentages.
      if (IsBasicLand(card)) {
        continue
      }
      totalCards += 1
      totalCardsInDeck += 1
    }

    // Count the colored mana symbols in the deck (its true devotion), so we can
    // measure how much a deck leans on each color by mana cost rather than card count.
    let pips = CountManaPips(decks[i].mainboard)
    let totalPips = pips.W + pips.U + pips.B + pips.R + pips.G

    // Go through each color in the deck's color identity, and increment
    // the count of cards within the deck that match that color identity.
    // TODO: This calculation excludes colorless cards, meaning percentages for colors
    // will not add up to 100%.
    let cardsPerColorInDeck = {}
    for (let deckColor of colors) {
      for (let card of decks[i].mainboard) {
        // Skip basic lands, since they just dilute the percentages.
        if (IsBasicLand(card)) {
          continue
        }
        for (var k in card.colors) {
          let cardColor = card.colors[k]
          if (!deckColor.includes(cardColor)) {
            continue
          }
          if (!cardsPerColorInDeck[deckColor]) {
            cardsPerColorInDeck[deckColor] = 0
          }
          cardsPerColorInDeck[deckColor] += 1

          // Once we count a card as counting towards this part of the deck's identity,
          // we don't need to count the same card twice (e.g., if it is multi-color and matches
          // the deck twice).
          break
        }
      }
    }

    for (var color in cardsPerColorInDeck) {
      // Get the number of cards that match this color within the deck.
      let num = cardsPerColorInDeck[color]

      // Track this color's devotion in the deck: the share of colored mana symbols
      // that belong to it, summed over the letters of its identity (e.g. "WU" -> W + U pips).
      if (totalPips > 0) {
        let colorPips = 0
        for (let c of color) {
          colorPips += pips[c]
        }
        tracker.get(color).deck_percentages.push(colorPips / totalPips)
      }

      // The percentage of cards in the deck that belong to this color, used to
      // weight wins into victory points.
      let deckFrac = num / totalCardsInDeck

      // Calculate "victory points" - the number of wins attributed to this color by weighting
      // the deck's total number of wins by the percentage of cards that belong to this color.
      let winFrac = deckFrac * Wins(decks[i])
      tracker.get(color).victory_points_per_deck.push(winFrac)

      // Calculate the total number of victory points that could have been achieved - i.e., if
      // all losses were instead wins.
      let lossFrac = deckFrac * Losses(decks[i])
      if (winFrac + lossFrac > 0) {
        tracker.get(color).available_victory_points += (winFrac + lossFrac)
      }
      tracker.get(color).cards += num
    }
  }

  // Normalize percent_of_wins within each identity length so the column sums
  // to 100% in mono, dual, and tri views independently.
  let winsByLen = {}
  for (let color of tracker.values()) {
    winsByLen[color.color.length] = (winsByLen[color.color.length] || 0) + color.wins
  }

  // Summarize tracker stats and calculate percentages.
  for (let color of tracker.values()) {
    // First, calculate the average color devotion of each deck based on colored mana symbols.
    // This is a measure of, on average, what share of a deck's mana pips are a given color in
    // decks with that color identity. A lower percentage means a splash, a higher percentage
    // means it is a primary staple.
    const densitySum = color.deck_percentages.reduce((sum, a) => sum + a, 0);
    const densityCount = color.deck_percentages.length;
    color.average_deck_percentage = Pct(densitySum, densityCount);
    color.victory_points = Math.round(100 * color.victory_points_per_deck.reduce((sum, a) => sum + a, 0)) / 100;

    // Calculate the percentage of all cards drafted that are this color.
    color.total_pick_percentage = Pct(color.cards, totalCards);
    color.build_percent = Pct(color.num_decks, decks.length)
    color.win_percent = Pct(color.wins, color.wins + color.losses)
    color.percent_of_wins = Pct(color.wins, winsByLen[color.color.length])
    if (color.word_count_count > 0) {
      color.avg_word_count = Math.round(color.word_count_sum / color.word_count_count * 100) / 100
    }
  }

  return tracker
}
