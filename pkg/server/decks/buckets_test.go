package decks

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func makeDeck(player string, draftID int, date string, games []types.Game) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Date = date
	d.Metadata.DraftID = draftID
	d.Draft = storage.DraftInfo{ID: draftID, Date: date}
	d.Games = games
	return d
}

func draftOn(id int, date string) *Draft {
	return &Draft{Info: storage.DraftInfo{ID: id, Date: date}}
}

// --- Bucket.Name ---

func TestBucketName_Empty(t *testing.T) {
	b := Bucket{}
	assert.Equal(t, "Empty Bucket", b.Name())
}

func TestBucketNameUsesDates(t *testing.T) {
	single := Bucket{Drafts: []*Draft{draftOn(4, "2024-01-01")}}
	assert.Equal(t, "2024-01-01", single.Name())

	sameDay := Bucket{Drafts: []*Draft{draftOn(4, "2024-01-01"), draftOn(5, "2024-01-01")}}
	assert.Equal(t, "2024-01-01", sameDay.Name())

	span := Bucket{Drafts: []*Draft{
		draftOn(1, "2024-01-01"),
		draftOn(2, "2024-02-01"),
		draftOn(3, "2024-03-01"),
	}}
	assert.Equal(t, "2024-01-01 – 2024-03-01", span.Name())
}

func TestBucketsOrderNumericIDs(t *testing.T) {
	// Same-date drafts order by numeric ID (9 before 10, not as strings),
	// and date comes before ID.
	decks := []*storage.Deck{
		makeDeck("Alice", 2, "2024-02-01", nil),
		makeDeck("Alice", 10, "2024-01-01", nil),
		makeDeck("Alice", 9, "2024-01-01", nil),
		makeDeck("Bob", 1, "2024-03-01", nil),
	}
	for _, discrete := range []bool{true, false} {
		buckets := DeckBuckets(decks, 1, discrete)
		var ids []int
		for _, b := range buckets {
			ids = append(ids, b.Drafts[0].Info.ID)
		}
		assert.Equal(t, []int{9, 10, 2, 1}, ids, "discrete=%v", discrete)
	}
}

// --- Bucket.AllDecks ---

func TestBucketAllDecks(t *testing.T) {
	d1 := makeDeck("Alice", 1, "2024-01-01", nil)
	d2 := makeDeck("Bob", 1, "2024-01-01", nil)
	d3 := makeDeck("Charlie", 2, "2024-01-02", nil)

	b := Bucket{Drafts: []*Draft{
		{Decks: []*storage.Deck{d1, d2}},
		{Decks: []*storage.Deck{d3}},
	}}

	all := b.AllDecks()
	assert.Equal(t, 3, len(all))
}

// --- Bucket.TotalGames ---

func TestBucketTotalGames(t *testing.T) {
	// Each game between Alice and Bob is recorded on both decks. Counting
	// each game once across the bucket means summing GameWins, since each
	// game has at most one winner.
	d1 := makeDeck("Alice", 1, "2024-01-01", nil)
	d1.Matches = []types.Match{{Opponent: "Bob", Wins: 1, Losses: 1}}
	d2 := makeDeck("Bob", 1, "2024-01-01", nil)
	d2.Matches = []types.Match{{Opponent: "Alice", Wins: 1, Losses: 1}}

	b := Bucket{Drafts: []*Draft{
		{Decks: []*storage.Deck{d1, d2}},
	}}

	// Alice won 1 game, Bob won 1 game → 2 distinct games.
	assert.Equal(t, 2, b.TotalGames())
}

// --- DeckBuckets discrete ---

func TestDeckBucketsDiscrete_Basic(t *testing.T) {
	// 4 drafts, bucket size 2 → 2 buckets
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
		makeDeck("Bob", 1, "2024-01-01", nil),
		makeDeck("Alice", 2, "2024-02-01", nil),
		makeDeck("Bob", 2, "2024-02-01", nil),
		makeDeck("Alice", 3, "2024-03-01", nil),
		makeDeck("Bob", 3, "2024-03-01", nil),
		makeDeck("Alice", 4, "2024-04-01", nil),
		makeDeck("Bob", 4, "2024-04-01", nil),
	}

	buckets := DeckBuckets(decks, 2, true)
	assert.Equal(t, 2, len(buckets))

	// First bucket should be the earlier drafts (chronological order)
	assert.Equal(t, "2024-01-01", buckets[0].Drafts[0].Info.Date)
	// Second bucket should be the later drafts
	assert.Equal(t, "2024-04-01", buckets[1].Drafts[len(buckets[1].Drafts)-1].Info.Date)
}

func TestDeckBucketsDiscrete_Remainder(t *testing.T) {
	// 3 drafts, bucket size 2 → 1 bucket (remainder of 1 draft is dropped)
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
		makeDeck("Alice", 2, "2024-02-01", nil),
		makeDeck("Alice", 3, "2024-03-01", nil),
	}

	buckets := DeckBuckets(decks, 2, true)
	assert.Equal(t, 1, len(buckets))
	// The bucket includes the last 2 drafts (working backwards)
	assert.Equal(t, 2, len(buckets[0].Drafts))
}

func TestDeckBucketsDiscrete_BucketSizeLargerThanDrafts(t *testing.T) {
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
		makeDeck("Alice", 2, "2024-02-01", nil),
	}

	buckets := DeckBuckets(decks, 10, true)
	assert.Equal(t, 1, len(buckets))
}

func TestDeckBucketsDiscrete_BucketSizeLargerThanDecks(t *testing.T) {
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
	}

	buckets := DeckBuckets(decks, 10, true)
	assert.Equal(t, 1, len(buckets))
	assert.Equal(t, 1, len(buckets[0].AllDecks()))
}

// --- DeckBuckets sliding ---

func TestDeckBucketsSliding_Basic(t *testing.T) {
	// 4 drafts, window size 2 → 3 sliding windows
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
		makeDeck("Alice", 2, "2024-02-01", nil),
		makeDeck("Alice", 3, "2024-03-01", nil),
		makeDeck("Alice", 4, "2024-04-01", nil),
	}

	buckets := DeckBuckets(decks, 2, false)
	assert.Equal(t, 3, len(buckets))

	// First window: draft 1 + 2
	assert.Equal(t, "2024-01-01", buckets[0].Drafts[0].Info.Date)
	assert.Equal(t, "2024-02-01", buckets[0].Drafts[1].Info.Date)

	// Last window: draft 3 + 4
	assert.Equal(t, "2024-03-01", buckets[2].Drafts[0].Info.Date)
	assert.Equal(t, "2024-04-01", buckets[2].Drafts[1].Info.Date)
}

func TestDeckBucketsSliding_WindowLargerThanDrafts(t *testing.T) {
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
		makeDeck("Alice", 2, "2024-02-01", nil),
	}

	buckets := DeckBuckets(decks, 5, false)
	assert.Equal(t, 1, len(buckets))
}

func TestDeckBucketsSliding_GroupsMultipleDecksPerDraft(t *testing.T) {
	// 2 drafts, each with 2 players
	decks := []*storage.Deck{
		makeDeck("Alice", 1, "2024-01-01", nil),
		makeDeck("Bob", 1, "2024-01-01", nil),
		makeDeck("Alice", 2, "2024-02-01", nil),
		makeDeck("Bob", 2, "2024-02-01", nil),
		makeDeck("Alice", 3, "2024-03-01", nil),
		makeDeck("Bob", 3, "2024-03-01", nil),
	}

	buckets := DeckBuckets(decks, 2, false)
	assert.Equal(t, 2, len(buckets))

	// Each bucket should have 2 drafts × 2 players = 4 decks
	assert.Equal(t, 4, len(buckets[0].AllDecks()))
	assert.Equal(t, 4, len(buckets[1].AllDecks()))
}
