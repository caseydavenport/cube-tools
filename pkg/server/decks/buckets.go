package decks

import (
	"slices"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// Bucket is a run of drafts, in date order, that the stats pages summarize as
// one data point.
type Bucket struct {
	Drafts []*Draft
}

// AllDecks returns the decks of every draft in the bucket.
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

// Start returns the bucket's starting date, which labels time-series charts.
func (b *Bucket) Start() string {
	if len(b.Drafts) == 0 {
		return ""
	}
	return b.Drafts[0].Info.Date
}

// Draft is the decks from a single draft event, with the event's details.
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

// lessDraft orders drafts by date, then by numeric ID, so same-day drafts keep
// the order they were played in.
func lessDraft(a, b *Draft) bool {
	if a.Info.Date != b.Info.Date {
		return a.Info.Date < b.Info.Date
	}
	return a.Info.ID < b.Info.ID
}

// DeckBuckets splits the given decks into buckets of bucketSize drafts. When
// discrete is true the buckets don't overlap and are cut from the newest draft
// back, dropping the oldest drafts that don't fill a bucket. Otherwise each
// bucket starts one draft after the last. Fewer drafts than bucketSize come
// back as one bucket. A bucketSize under 1 is treated as 1, since a discrete
// split by zero would never advance.
func DeckBuckets(decks []*storage.Deck, bucketSize int, discrete bool) []Bucket {
	bucketSize = max(bucketSize, 1)
	if discrete {
		return deckBucketsDiscrete(decks, bucketSize)
	}
	return deckBucketsSliding(decks, bucketSize)
}

// deckBucketsDiscrete cuts the drafts into non-overlapping buckets, working
// back from the newest draft.
func deckBucketsDiscrete(decks []*storage.Deck, bucketSize int) []Bucket {
	drafts := groupDrafts(decks)

	// If the bucket size is larger than the number of drafts, return a single bucket.
	if bucketSize >= len(drafts) {
		return []Bucket{{Drafts: drafts}}
	}

	// Take bucketSize drafts at a time from the end; drafts is already in date order.
	buckets := []Bucket{}
	for end := len(drafts); end >= bucketSize; end -= bucketSize {
		buckets = append(buckets, Bucket{Drafts: slices.Clone(drafts[end-bucketSize : end])})
	}

	// Buckets were cut newest first, so flip them to chronological order.
	slices.Reverse(buckets)
	return buckets
}

// deckBucketsSliding makes one bucket per window of bucketSize consecutive
// drafts, advancing one draft at a time.
func deckBucketsSliding(decks []*storage.Deck, bucketSize int) []Bucket {
	drafts := groupDrafts(decks)

	// If the bucket size is larger than the number of drafts, return a single bucket.
	if bucketSize >= len(drafts) {
		return []Bucket{{Drafts: drafts}}
	}

	buckets := []Bucket{}
	for start := 0; start <= len(drafts)-bucketSize; start++ {
		buckets = append(buckets, Bucket{Drafts: slices.Clone(drafts[start : start+bucketSize])})
	}
	return buckets
}
