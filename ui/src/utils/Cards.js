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

// CardData returns data for each card that matches the given minimum number of drafts. The provided
// cube list is used to filter cards no longer in the cube.
export function CardData(decks, minDrafts, minGames, cube, color) {
  console.time("CardData")
  let data = cardDataClientSide(decks, minDrafts, minGames, cube, color)
  console.timeEnd("CardData")
  return data
}

function cardDataClientSide(decks, minDrafts, minGames, cube, color) {

  let cardsByName = new Map()
  let drafts = new Map()

  // Define a helper function for initializing a new empty card.
  let newCard = function(card) {
    let c = {
      name: card.name,
      mainboard: 0, // Number of times this card has been mainboarded.
      sideboard: 0, // Number of times this card has been sideboarded.
      playableSideboard: 0, // Number of times this card was in deck color(s), and sideboarded.
      wins: 0, // Does not include sideboard.
      losses: 0, // Does not include sideboard.
      trophies: 0, // 3-0 decks this card has been in.
      lastplace: 0, // 0-3 decks this card has been in.
      win_percent: 0,
      mainboard_percent: 0,
      sideboard_percent: 0,
      archetypes: new Map(), // Map of archetype to times played in that archetype.
      players: new Map(), // Who has played this card, and how often.
      sideboarders: new Map(), // Who has sideboarded this card, and how often.
      url: card.url,
      lastMainboarded: "", // The last date that this card was mainboarded.
      appearances: 0, // Number of times the card appears in a replay.
      cmc: card.cmc, // Mana value
      interaction: IsInteraction(card), // Whether or not this card is classified as "interaction".
      counterspell: IsCounterspell(card), // Whether or not this is a counterpell.
      removal: IsRemoval(card), // Whether or not this is removal.
      land: IsLand(card), // Whether or not this is a land.
    }
    return c
  }

  // Build a map of all the cards in the cube so we can
  // easily skip any cards not currently in the cube.
  let cubeCards = new Map()
  for (let card of cube.cards) {
    cubeCards.set(card.name, card)
  }

  for (var i in decks) {
    let deck = decks[i]

    // Most cards are singleton in my cube. Except for fetches / shocks, for which it is
    // very possible there are multiple in the same deck. Create a "set" of all the unique
    // cards in the deck - this prevents double counting the wins contributed from a deck when there are
    // two of a card in that deck. This is imperfect - there is some value in knowing that a deck with two Arid Mesas
    // performed well - but I think without this deduplication we would overstate the importance of Arid Mesa in that deck
    // more than we understate it now.
    let cardSet = new Map()
    for (let card of deck.mainboard) {
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

      // Add to the card set.
      cardSet.set(card.name, card)
    }

    for (let [name, card] of cardSet) {
      if (!cardsByName.has(card.name)) {
        cardsByName.set(card.name, newCard(card))
      }

      // Increment basic stats for this card.
      cardsByName.get(card.name).mainboard += 1
      cardsByName.get(card.name).wins += Wins(decks[i])
      cardsByName.get(card.name).losses += Losses(decks[i])
      cardsByName.get(card.name).trophies += Trophies(decks[i])
      cardsByName.get(card.name).lastplace += LastPlaceFinishes(decks[i])

      if (card.appearances) {
        cardsByName.get(card.name).appearances += card.appearances
      }

      // Update the last date that this card was put in a mainboard.
      cardsByName.get(card.name).lastMainboarded = compareDates(deck.date, cardsByName.get(card.name).lastMainboarded)

      // Increment player count.
      if (!cardsByName.get(card.name).players.has(deck.player)) {
        cardsByName.get(card.name).players.set(deck.player, 0)
      }
      cardsByName.get(card.name).players.set(deck.player, cardsByName.get(card.name).players.get(deck.player) + 1)

      // Include archetype data for this card, which allows us to map cards to archetypes
      // and compare their performance to other cards in the same archetype.
      for (var k in deck.labels) {
        const arch = deck.labels[k]
        let cardData = cardsByName.get(card.name)
        cardData.archetypes.has(arch) || cardData.archetypes.set(arch, 0)
        cardData.archetypes.set(arch, cardData.archetypes.get(arch) + 1)
      }
    }

    // Go through the sideboard and increment the counter. Not every deck has a sideboard since
    // that data isn't always collected, so this information is only partly reliable. It's still nice to see.
    for (var j in deck.sideboard) {
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

      if (!cardsByName.has(card.name)) {
        cardsByName.set(card.name, newCard(card))
      }
      cardsByName.get(card.name).sideboard += 1
      if (InDeckColor(card, deck)) {
        cardsByName.get(card.name).playableSideboard += 1
      }

      // Increment count of players who sideboarded this card.
      if (!cardsByName.get(card.name).sideboarders.has(deck.player)) {
        cardsByName.get(card.name).sideboarders.set(deck.player, 0)
      }
      cardsByName.get(card.name).sideboarders.set(deck.player, cardsByName.get(card.name).sideboarders.get(deck.player) + 1)
    }
  }

  // Convert total number of drafts.
  let totalDrafts = drafts.size


  // Calculate ELO data, which we'll merge in below.
  let eloData = ELOData(decks)

  for (let [c, card] of cardsByName) {
    if ((card.mainboard + card.sideboard) < minDrafts) {
      // Skip any cards that haven't been picked enough - this is an approximation of
      // the number of drafts the card has appeared in. There is some fuzziness because not all drafts
      // record sideboards, and so it is possible that a card has been in more drafts than we know about.
      cardsByName.delete(c)
      continue
    } else if ((card.wins + card.losses) < minGames) {
      // Filter out cards that haven't seen enough total games. This allows filtering based on the actual
      // amount of play a card may have seen, although we don't know if the card was actually ever drawn in these games.
      cardsByName.delete(c)
      continue
    }
    cardsByName.get(c).pick_percent = Math.round((card.mainboard + card.sideboard) / totalDrafts * 100) // TODO: Unused
    cardsByName.get(c).mainboard_percent = Math.round(card.mainboard / (card.mainboard + card.sideboard) * 100)
    cardsByName.get(c).sideboard_percent = Math.round(card.sideboard / (card.mainboard + card.sideboard) * 100)
    cardsByName.get(c).playable_sideboard_percent = Math.round(card.playableSideboard / (card.mainboard + card.sideboard) * 100)
    cardsByName.get(c).record = card.wins + "-" + card.losses + "-" + 0
    cardsByName.get(c).total_games = card.wins + card.losses
    cardsByName.get(c).elo = eloData.get(card.name).elo
    cardsByName.get(c).win_percent = 0
    if (card.wins + card.losses > 0) {
      // Calculate win percentage for cards that have been mainboarded before.
      cardsByName.get(c).win_percent = Math.round(card.wins / (card.wins + card.losses) * 100)
    }
  }
  return cardsByName
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

export function CardAnalyze(card, archetypeData, playerData, decks) {
 // For this card, determine the weighted average of the archetype win rates for the
 // archetypes that it sees play in. We'll use this to calculate the card's win rate compared
 // to its own archetype win rates.

  // Calculate total number of "Wins" across all decks. We'll use this to
  // calculate the percentage of all wins that have included each card.
  let totalWins = 0
  for (let deck of decks) {
    totalWins += Wins(deck)
  }

  // relativePerfArch is the performance of this card relative to the expected performance of
  // all of the archetypes that this card has played in.
  let relativePerfArch = 0

  // Determine the total number of instances of all archetypes this card has to use as the denominator when
  // calculating weighted averages below. The card.archetypes map has keys of the archetype name, and values of
  // the number of times it was seen in a deck of that archetype.
  let totalPicks = 0
  for (let num of card.archetypes.values()) {
    totalPicks += num
  }

  // For each archetype, use the number of times it shows up for this card, the total number of instances of archetypes
  // this card belongs to, and each archetype's average win rate in order to calculate a weighted average
  // representing the expected win rate of the card.
  let weightedBaseRate = 0
  for (let [arch, numArchDecks] of card.archetypes) {
    let archWinRate = 0

    if (archetypeData.has(arch)) {
      archWinRate = archetypeData.get(arch).win_percent
    }
    let weight = numArchDecks / totalPicks
    weightedBaseRate += weight * archWinRate
  }

  if (card.mainboard > 0) {
    // Assuming this card has been played, calculate the card's win rate vs. the expected win rate based on its archetypes.
    relativePerfArch = Math.round(card.win_percent / weightedBaseRate * 100) / 100
  }

  // Determine the card's performance compared to the players who have played it.
  // relativePerfPlayer is the performance of this card relative to the expected performance of the card
  // based on the win rate of all the players that have played this card.
  let relativePerfPlayer = 0

  // expectedRate is the expected performance of the card based on the players who have played this card. A higher value means
  // that this card is played on average by players who win more.
  let expectedRate = 0

  let playCount = 0
  for (let [player, count] of card.players) {
    expectedRate += count * playerData.get(player).winPercent / 100
    playCount += count
  }
  if (playCount > 0) {
    expectedRate = Math.round(100 * expectedRate / playCount) / 100
    relativePerfPlayer = Math.round(card.win_percent / expectedRate) / 100

    // Convert to a percentage to display in the UI.
    expectedRate = Math.round(expectedRate * 100)
  }

  // Determine % of all wins including this card.
  let pow = 100 * Math.round(100 * card.wins / totalWins) / 100

  return [relativePerfPlayer, relativePerfArch, expectedRate, pow]
}
