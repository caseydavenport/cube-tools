package decks

import (
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// A bucket is a collection of drafts.
type Bucket struct {
	Drafts []*Draft
}

func (b *Bucket) AllDecks() []*storage.Deck {
	decks := []*storage.Deck{}
	for _, draft := range b.Drafts {
		decks = append(decks, draft.Decks...)
	}
	return decks
}

func (b *Bucket) TotalGames() int {
	total := 0
	for _, draft := range b.Drafts {
		for _, deck := range draft.Decks {
			total += len(deck.Games)
		}
	}
	return total
}

func (b *Bucket) Name() string {
	if len(b.Drafts) == 0 {
		return "Empty Bucket"
	}
	if len(b.Drafts) == 1 {
		return b.Drafts[0].Name
	}
	return b.Drafts[0].Name + " - " + b.Drafts[len(b.Drafts)-1].Name
}

// A draft is a collection of decks from a single draft event.
type Draft struct {
	Name  string
	Decks []*storage.Deck
}

// DeckBuckets splits the given decks into buckets of the given size.
// If discrete is true, uses non-overlapping buckets; otherwise uses sliding buckets.
func DeckBuckets(decks []*storage.Deck, bucketSize int, discrete bool) []Bucket {
	if discrete {
		return deckBucketsDiscrete(decks, bucketSize)
	}
	return deckBucketsSliding(decks, bucketSize)
}

func deckBucketsDiscrete(decks []*storage.Deck, bucketSize int) []Bucket {
	// Create a map of draft ID to Draft structure containing decks for that draft.
	draftMap := make(map[string]*Draft)
	for _, deck := range decks {
		draftID := deck.Metadata.DraftID
		if _, ok := draftMap[draftID]; !ok {
			draftMap[draftID] = &Draft{
				Name:  draftID,
				Decks: []*storage.Deck{},
			}
		}
		draftMap[draftID].Decks = append(draftMap[draftID].Decks, deck)
	}

	// Convert map to slice
	drafts := make([]*Draft, 0, len(draftMap))
	for _, draft := range draftMap {
		drafts = append(drafts, draft)
	}

	// Sort drafts by name (assuming name is date string)
	sort.Slice(drafts, func(i, j int) bool {
		return drafts[i].Name < drafts[j].Name
	})

	// Create buckets, working back from the end by bucketSize.
	buckets := []Bucket{}
	for i := len(drafts); i >= bucketSize; i -= bucketSize {
		bucket := Bucket{Drafts: []*Draft{}}
		for j := 1; j <= bucketSize; j++ {
			k := i - j
			bucket.Drafts = append(bucket.Drafts, drafts[k])
		}
		buckets = append(buckets, bucket)
	}

	// Reverse buckets to be chronological.
	for i, j := 0, len(buckets)-1; i < j; i, j = i+1, j-1 {
		buckets[i], buckets[j] = buckets[j], buckets[i]
	}
	return buckets
}

func deckBucketsSliding(decks []*storage.Deck, bucketSize int) []Bucket {
	// Map draft_id to Draft
	draftMap := make(map[string]*Draft)
	for _, deck := range decks {
		draftID := deck.Metadata.DraftID
		if _, ok := draftMap[draftID]; !ok {
			draftMap[draftID] = &Draft{
				Name:  draftID,
				Decks: []*storage.Deck{},
			}
		}
		draftMap[draftID].Decks = append(draftMap[draftID].Decks, deck)
	}
	// Convert map to slice
	drafts := make([]*Draft, 0, len(draftMap))
	for _, draft := range draftMap {
		drafts = append(drafts, draft)
	}
	// Sort drafts by name (assuming name is date string)
	sort.Slice(drafts, func(i, j int) bool {
		return drafts[i].Name < drafts[j].Name
	})

	// Create rolling buckets.
	buckets := []Bucket{}
	for i := 0; i <= len(drafts)-bucketSize; i++ {
		bucket := Bucket{Drafts: []*Draft{}}
		for j := range bucketSize {
			bucket.Drafts = append(bucket.Drafts, drafts[i+j])
		}
		buckets = append(buckets, bucket)
	}
	return buckets
}
