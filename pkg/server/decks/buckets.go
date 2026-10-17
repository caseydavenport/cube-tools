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

// TotalGames returns the count of distinct games played in this bucket. Each
// game is recorded once on each side, so summing GameWins() across all decks
// counts each game exactly once (modulo ties, which contribute no wins).
func (b *Bucket) TotalGames() int {
	total := 0
	for _, draft := range b.Drafts {
		for _, deck := range draft.Decks {
			total += deck.GameWins()
		}
	}
	return total
}

// Name labels the bucket by the dates it spans.
func (b *Bucket) Name() string {
	if len(b.Drafts) == 0 {
		return "Empty Bucket"
	}
	first, last := b.Start(), b.Drafts[len(b.Drafts)-1].Info.Date
	if first == last {
		return first
	}
	return first + " – " + last
}

// Start returns the bucket's starting date, used to label time-series charts.
func (b *Bucket) Start() string {
	if len(b.Drafts) == 0 {
		return ""
	}
	return b.Drafts[0].Info.Date
}

// A draft is a collection of decks from a single draft event.
type Draft struct {
	Info  storage.DraftInfo
	Decks []*storage.Deck
}

// groupDrafts groups decks by draft ID, ordered by date and then ID.
func groupDrafts(decks []*storage.Deck) []*Draft {
	byID := make(map[int]*Draft)
	var out []*Draft
	for _, deck := range decks {
		id := deck.Metadata.DraftID
		d, ok := byID[id]
		if !ok {
			info := deck.Draft
			info.ID = id
			if info.Date == "" {
				info.Date = deck.Date
			}
			d = &Draft{Info: info}
			byID[id] = d
			out = append(out, d)
		}
		d.Decks = append(d.Decks, deck)
	}
	sort.Slice(out, func(i, j int) bool { return lessDraft(out[i], out[j]) })
	return out
}

func lessDraft(a, b *Draft) bool {
	if a.Info.Date != b.Info.Date {
		return a.Info.Date < b.Info.Date
	}
	return a.Info.ID < b.Info.ID
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
	drafts := groupDrafts(decks)

	// If the bucket size is larger than the number of drafts, return a single bucket.
	if bucketSize >= len(drafts) {
		return []Bucket{{Drafts: drafts}}
	}

	// Create buckets, working back from the end by bucketSize.
	buckets := []Bucket{}
	for i := len(drafts); i >= bucketSize; i -= bucketSize {
		bucket := Bucket{Drafts: []*Draft{}}
		for j := 1; j <= bucketSize; j++ {
			k := i - j
			bucket.Drafts = append(bucket.Drafts, drafts[k])
		}

		sort.Slice(bucket.Drafts, func(i, j int) bool { return lessDraft(bucket.Drafts[i], bucket.Drafts[j]) })
		buckets = append(buckets, bucket)
	}

	// Reverse buckets to be chronological.
	for i, j := 0, len(buckets)-1; i < j; i, j = i+1, j-1 {
		buckets[i], buckets[j] = buckets[j], buckets[i]
	}
	return buckets
}

func deckBucketsSliding(decks []*storage.Deck, bucketSize int) []Bucket {
	drafts := groupDrafts(decks)

	// If the bucket size is larger than the number of drafts, return a single bucket.
	if bucketSize >= len(drafts) {
		return []Bucket{{Drafts: drafts}}
	}

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
