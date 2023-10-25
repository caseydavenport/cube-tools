import React from 'react'

// Split the given drafts into rolling buckets of the given size.
export function DeckBuckets(decks, bucketSize) {
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
  for (i = 0; i < drafts.length-bucketSize; i++) {
    let bucket = new Array()
    for (var j = 0; j < bucketSize; j++) {
      bucket.push(drafts[i+j])
    }
    buckets.push(bucket)
  }
  return buckets
}
