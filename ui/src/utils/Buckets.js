import React from 'react'
import { Wins, Losses } from "./Deck.js"

// Draft names are date strings (YYYY-MM-DD), so a plain string compare
// orders them chronologically.
function sortByName(a, b) {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return 0
}

// Split the given drafts into rolling buckets of the given size.
export function DeckBuckets(decks, bucketSize, discrete) {
  if (discrete) {
    return deckBucketsDiscrete(decks, bucketSize)
  }
  return deckBucketsSliding(decks, bucketSize)
}

function deckBucketsDiscrete(decks, bucketSize) {
  // We need to turn the list of decks into a list of drafts instead.
  let draftMap = new Map()
  for (var i in decks) {
    let deck = decks[i]
    if (!draftMap.has(deck.metadata.draft_id)) {
      draftMap.set(deck.metadata.draft_id, {
        name: deck.metadata.draft_id,
        decks: new Array(),
      })
    }
    draftMap.get(deck.metadata.draft_id).decks.push(deck)
  }
  // We now have a map of draft -> list of decks within it.
  // Turn this into an ordered array. The name of the draft is its date.
  let drafts = Array.from(draftMap.values())
  drafts.sort(sortByName)

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
  // We need to turn the list of decks into a list of drafts instead.
  let draftMap = new Map()
  for (var i in decks) {
    let deck = decks[i]
    if (!draftMap.has(deck.metadata.draft_id)) {
      draftMap.set(deck.metadata.draft_id, {
        name: deck.metadata.draft_id,
        decks: new Array(),
      })
    }
    draftMap.get(deck.metadata.draft_id).decks.push(deck)
  }
  // We now have a map of draft -> list of decks within it.
  // Turn this into an ordered array. The name of the draft is its date.
  let drafts = Array.from(draftMap.values())
  drafts.sort(sortByName)

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

// Draft IDs look like "2023-04-27_local_1". On an axis we only want the date,
// so strip the "_local_N" suffix to keep labels short.
function shortName(name) {
  let m = name.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : name
}

export function BucketName(bucket) {
  // Label a bucket by its starting date. The full range is too long for an
  // axis once you have more than a handful of buckets.
  return shortName(bucket[0].name)
}

// Shared x-axis tick config for bucketed time-series charts: blank out all but
// every Nth label so only ~6 evenly spaced dates show. chart.js's autoSkip
// won't reliably cap a category axis (it just shrinks the font and keeps every
// label), so we thin them ourselves. Labels are already clean start dates
// (BucketName for client buckets, the bucket "start" field for server buckets).
export const bucketTicks = {
  color: "#FFF",
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
