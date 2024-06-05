import React from 'react'

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
    if (!draftMap.has(deck.draft)) {
      draftMap.set(deck.draft, {
        name: deck.draft,
        decks: new Array(),
      })
    }
    draftMap.get(deck.draft).decks.push(deck)
  }
  // We now have a map of draft -> list of decks within it.
  // Turn this into an ordered array. The name of the draft is its date.
  let drafts = Array.from(draftMap.values())
  drafts.sort(function(a, b) {
    return a.name > b.name
  })


  // Create an array of buckets, starting from the end.
  let buckets = new Array()
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
    if (!draftMap.has(deck.draft)) {
      draftMap.set(deck.draft, {
        name: deck.draft,
        decks: new Array(),
      })
    }
    draftMap.get(deck.draft).decks.push(deck)
  }
  // We now have a map of draft -> list of decks within it.
  // Turn this into an ordered array. The name of the draft is its date.
  let drafts = Array.from(draftMap.values())
  drafts.sort(function(a, b) {
    return a.name > b.name
  })

  // Now build up an array of rolling buckets. Each bucket contains bucketSize drafts.
  var i = 0;
  let buckets = new Array()
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
  // A bucket is an array of decks. The name is the interval from the first
  // to the last.
  if (bucket.length == 1) {
    return bucket[0].name
  }
  return bucket[0].name + " - " + bucket[bucket.length-1].name
}
