// Archetype stats worked out in the browser from a list of decks.

import { Trophies, LastPlaceFinishes, Winning, Losing, Wins, Losses } from "../../utils/Deck.js"
import { winInterval } from "../../utils/Stats.js"
import { personLabel } from "../../utils/Players.js"

export function ArchetypeData(decks, confidence) {
  let newType = function(type) {
    return {
      type: type,
      count: 0,
      wins: 0,
      losses: 0,
      shared_with: new Map(),
      num_shared_with: 0,
      players: new Map(),
      build_percent: 0,
      win_percent: 0,
      avg_shared: 0,
      avg_cmc: 0,
      avg_word_count: 0,
      num_wc_decks: 0,
      num_cmc_decks: 0,
      trophies: 0,
      last_place: 0,
      winning: 0,
      losing: 0,
    }
  }

  // First, determine the popularity of each archetype by iterating all decks
  // and counting the instances of each.
  let totalGames = 0
  let tracker = new Map()

  // We set aggro/midrange/control for every set of decks, even if they are
  // zeroed out. This enables graphs that expect these to exist.
  tracker.set("aggro", newType("aggro"))
  tracker.set("midrange", newType("midrange"))
  tracker.set("control", newType("control"))

  for (let deck of decks) {
    // We only need to count wins, because every loss is counted in another deck as a win.
    totalGames += Wins(deck)

    let types = deck.labels.slice()
    if (deck.macro_archetype) types.push(deck.macro_archetype)
    for (let type of types) {
      if (!tracker.has(type)) {
        tracker.set(type, newType(type))
      }
      tracker.get(type).count += 1
      tracker.get(type).wins += Wins(deck)
      tracker.get(type).losses += Losses(deck)
      tracker.get(type).trophies += Trophies(deck)
      tracker.get(type).winning += Winning(deck)
      tracker.get(type).losing += Losing(deck)
      tracker.get(type).last_place += LastPlaceFinishes(deck)

      // Sum the values here, and divide them after we iterate all decks.
      if (deck.avg_cmc !== null) {
        tracker.get(type).avg_cmc += deck.avg_cmc
        tracker.get(type).num_cmc_decks += 1
      }
      if (deck.avg_word_count !== null && deck.avg_word_count !== undefined) {
        tracker.get(type).avg_word_count += deck.avg_word_count
        tracker.get(type).num_wc_decks += 1
      }

      // Track who plays this archetype, and how often.
      const who = personLabel(deck)
      if (!tracker.get(type).players.has(who)) {
        tracker.get(type).players.set(who, 0)
      }
      tracker.get(type).players.set(who, tracker.get(type).players.get(who) + 1)

      // Track other types shared with this one, and how frequent.
      for (var k in types) {
        // Skip aggro / control / midrange since those are applied to every deck.
        if (types[k] == "aggro" || types[k] == "midrange" || types[k] == "control") {
          continue
        }
        if (types[k] != type) {
          // Skip itself.
          if (!tracker.get(type).shared_with.has(types[k])) {
            tracker.get(type).shared_with.set(types[k], 0)
          }
          tracker.get(type).shared_with.set(types[k], tracker.get(type).shared_with.get(types[k]) + 1)
          tracker.get(type).num_shared_with += 1
        }
      }
    }
  }

  // Perform calculation on each entry.
  tracker.forEach(function(archetype) {
    archetype.build_percent = Math.round(archetype.count / decks.length * 100)
    archetype.win_percent = Math.round(archetype.wins / (archetype.wins + archetype.losses) * 100)
    const ci = winInterval(archetype.wins, archetype.losses, 0, confidence)
    archetype.win_percent_low = ci.low
    archetype.win_percent_high = ci.high
    archetype.significant = ci.significant
    archetype.percent_of_wins = Math.round(archetype.wins / totalGames * 100)
    archetype.record = archetype.wins + "-" + archetype.losses + "-" + 0
    archetype.avg_shared = Math.round(archetype.num_shared_with / archetype.count * 100) / 100
    if (archetype.num_cmc_decks > 0) {
      archetype.avg_cmc = Math.round(archetype.avg_cmc / archetype.num_cmc_decks * 100) / 100
    } else {
      archetype.avg_cmc = 0
    }
    if (archetype.num_wc_decks > 0) {
      archetype.avg_word_count = Math.round(archetype.avg_word_count / archetype.num_wc_decks * 100) / 100
    } else {
      archetype.avg_word_count = 0
    }
  })
  return tracker
}
