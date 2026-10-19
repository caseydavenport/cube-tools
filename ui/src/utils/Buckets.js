import React from 'react'
import { Wins, Losses } from "./Deck.js"
import { compareDrafts } from "./DraftInfo.js"

// groupDrafts turns a list of decks into a list of drafts, each holding the
// draft info and its decks, ordered by date and then id.
function groupDrafts(decks) {
  let draftMap = new Map()
  for (let deck of decks) {
    const id = deck.metadata.draft_id
    if (!draftMap.has(id)) {
      draftMap.set(id, { draft: deck.draft, decks: [] })
    }
    draftMap.get(id).decks.push(deck)
  }
  return Array.from(draftMap.values()).sort((a, b) => compareDrafts(a.draft, b.draft))
}

// Split the given drafts into rolling buckets of the given size.
export function DeckBuckets(decks, bucketSize, discrete) {
  if (discrete) {
    return deckBucketsDiscrete(decks, bucketSize)
  }
  return deckBucketsSliding(decks, bucketSize)
}

function deckBucketsDiscrete(decks, bucketSize) {
  let drafts = groupDrafts(decks)

  // Create an array of buckets, starting from the end.
  const buckets = new Array()
  for (let i = drafts.length; i >= bucketSize; i-=bucketSize) {
    let bucket = new Array()
    for (var j = 1; j <= bucketSize; j++) {
      let k = i-j
      bucket.push(drafts[i-j])
    }
    buckets.push(bucket)
  }
  return buckets.reverse()
}

function deckBucketsSliding(decks, bucketSize) {
  let drafts = groupDrafts(decks)

  // Now build up an array of rolling buckets. Each bucket contains bucketSize drafts.
  var i = 0;
  const buckets = new Array()
  for (i = 0; i <= drafts.length-bucketSize; i++) {
    let bucket = new Array()
    for (var j = 0; j < bucketSize; j++) {
      bucket.push(drafts[i+j])
    }
    buckets.push(bucket)
  }
  return buckets
}

export function BucketName(bucket) {
  // Label a bucket by its starting date. The full range is too long for an
  // axis once you have more than a handful of buckets.
  return bucket[0].draft.date
}

// Shared x-axis tick config for bucketed time-series charts: blank out all but
// every Nth label so only ~6 evenly spaced dates show. chart.js's autoSkip
// won't reliably cap a category axis (it just shrinks the font and keeps every
// label), so we thin them ourselves. Labels are already clean start dates
// (BucketName for client buckets, the bucket "start" field for server buckets).
export const bucketTicks = {
  autoSkip: false,
  maxRotation: 0,
  minRotation: 0,
  callback: function (value, index, ticks) {
    const step = Math.max(1, Math.ceil(ticks.length / 6))
    return index % step === 0 ? this.getLabelForValue(value) : ""
  },
}

// Convenience wrapper for charts whose x-axis carries no other config.
export const bucketXScale = { ticks: bucketTicks }

// Wins returns the total number of game wins that occur within the bucket.
export function BucketWins(bucket) {
  let wins = 0
  for (let draft of bucket) {
    for (let deck of draft.decks) {
      wins += Wins(deck)
    }
  }
  return wins
}
