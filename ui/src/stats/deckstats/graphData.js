// Data the Deck stats charts share, worked out once from the parsed decks.

import { deckRef } from "../../decks/deckModel.js"
import { BucketName } from "../../utils/Buckets.js"
import { CounterspellMatches, RemovalMatches } from "../../utils/cardMatches.js"

// BuildGraphData is common logic to calculate various bit of data for plotting graphs, so that we don't
// need to iterate the complete data set for each graph.
//
// TODO: Ideally we'd move this into the API server.
export function BuildGraphData(parsed) {
  let buckets = parsed.deckBuckets
  let colors = ["W", "U", "B", "R", "G"]

  // Build a set of labels for each bucket.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
  }

  // Pre-calculate statistics for each filtered deck.
  const deckStatsMap = new Map()
  for (let deck of parsed.filteredDecks) {
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

    let mbCounterspells = 0
    let sbCounterspells = 0
    let removal = {
      mb: { cmc: 0, count: 0 },
      sb: { cmc: 0, count: 0 },
    }
    let interaction = {
      mb: { byColor: new Map() },
    }

    for (let card of deck.mainboard) {
      let isCounterspell = false
      let isRemoval = false
      const oracle = (card.oracle_text || "").toLowerCase()

      for (let match of CounterspellMatches) {
        if (oracle.includes(match)) {
          mbCounterspells += 1
          isCounterspell = true
          break
        }
      }

      for (let match of RemovalMatches) {
        if (oracle.includes(match)) {
          removal.mb.count += 1
          removal.mb.cmc += card.cmc
          isRemoval = true
          break
        }
      }

      if (isRemoval || isCounterspell) {
        for (let color of card.colors) {
          interaction.mb.byColor.set(color, (interaction.mb.byColor.get(color) || 0) + 1)
        }
      }
    }

    for (let card of (deck.sideboard || [])) {
      const oracle = (card.oracle_text || "").toLowerCase()
      for (let match of CounterspellMatches) {
        if (oracle.includes(match)) {
          sbCounterspells += 1
          break
        }
      }
      for (let match of RemovalMatches) {
        if (oracle.includes(match)) {
          removal.sb.count += 1
          removal.sb.cmc += card.cmc
          break
        }
      }
    }

    deckStatsMap.set(deckRef(deck), {
      mbCounterspells,
      sbCounterspells,
      removal,
      interaction
    })
  }

  // Calculate per-bucket, over time data.
  const bucketed = {
    mbCounterspells: [],
    sbCounterspells: [],
    removal: {
      mb: { count: [], cmc: [] },
      sb: { count: [], cmc: [] },
    },
    interaction: {
      mb: {
        byColor: new Map([
          ["W", []], ["U", []], ["B", []], ["R", []], ["G", []],
        ]),
      },
    }
  }

  for (let bucket of buckets) {
    let mbCounterspells = 0
    let sbCounterspells = 0
    let removalCountMB = 0
    let removalCMCMB = 0
    let removalCountSB = 0
    let removalCMCSB = 0
    let interactionMBByColor = new Map()
    let deckCount = 0

    for (let draft of bucket) {
      for (let deck of draft.decks) {
        const stats = deckStatsMap.get(deckRef(deck))
        if (!stats) continue
        deckCount++
        mbCounterspells += stats.mbCounterspells
        sbCounterspells += stats.sbCounterspells
        removalCountMB += stats.removal.mb.count
        removalCMCMB += stats.removal.mb.cmc
        removalCountSB += stats.removal.sb.count
        removalCMCSB += stats.removal.sb.cmc
        for (let [color, count] of stats.interaction.mb.byColor) {
          interactionMBByColor.set(color, (interactionMBByColor.get(color) || 0) + count)
        }
      }
    }

    if (deckCount === 0) deckCount = 1 // avoid div by zero

    bucketed.mbCounterspells.push(mbCounterspells / deckCount)
    bucketed.sbCounterspells.push(sbCounterspells / deckCount)
    bucketed.removal.mb.count.push(removalCountMB / deckCount)
    bucketed.removal.sb.count.push(removalCountSB / deckCount)
    bucketed.removal.mb.cmc.push(removalCMCMB / (removalCountMB || 1))
    bucketed.removal.sb.cmc.push(removalCMCSB / (removalCountSB || 1))

    for (let color of colors) {
      let v = bucketed.interaction.mb.byColor.get(color)
      v.push((interactionMBByColor.get(color) || 0) / (parsed.bucketSize || 1))
      bucketed.interaction.mb.byColor.set(color, v)
    }
  }

  return { labels, bucketed }
}
