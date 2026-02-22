package decks

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func makeDeck(player, draftID string, games []types.Game) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Games = games
	return d
}

// --- Bucket.Name ---

func TestBucketName_Empty(t *testing.T) {
	b := Bucket{}
	assert.Equal(t, "Empty Bucket", b.Name())
}

func TestBucketName_Single(t *testing.T) {
	b := Bucket{Drafts: []*Draft{{Name: "2024-01-01"}}}
	assert.Equal(t, "2024-01-01", b.Name())
}

func TestBucketName_Range(t *testing.T) {
	b := Bucket{Drafts: []*Draft{
		{Name: "2024-01-01"},
		{Name: "2024-02-01"},
		{Name: "2024-03-01"},
	}}
	assert.Equal(t, "2024-01-01 - 2024-03-01", b.Name())
}

// --- Bucket.AllDecks ---

func TestBucketAllDecks(t *testing.T) {
	d1 := makeDeck("Alice", "draft1", nil)
	d2 := makeDeck("Bob", "draft1", nil)
	d3 := makeDeck("Charlie", "draft2", nil)

	b := Bucket{Drafts: []*Draft{
		{Decks: []*storage.Deck{d1, d2}},
		{Decks: []*storage.Deck{d3}},
	}}

	all := b.AllDecks()
	assert.Equal(t, 3, len(all))
}

// --- Bucket.TotalGames ---

func TestBucketTotalGames(t *testing.T) {
	d1 := makeDeck("Alice", "draft1", []types.Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Bob"},
	})
	d2 := makeDeck("Bob", "draft1", []types.Game{
		{Opponent: "Alice", Winner: "Alice"},
	})

	b := Bucket{Drafts: []*Draft{
		{Decks: []*storage.Deck{d1, d2}},
	}}

	assert.Equal(t, 3, b.TotalGames())
}

// --- DeckBuckets discrete ---

func TestDeckBucketsDiscrete_Basic(t *testing.T) {
	// 4 drafts, bucket size 2 → 2 buckets
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
		makeDeck("Bob", "2024-01-01", nil),
		makeDeck("Alice", "2024-02-01", nil),
		makeDeck("Bob", "2024-02-01", nil),
		makeDeck("Alice", "2024-03-01", nil),
		makeDeck("Bob", "2024-03-01", nil),
		makeDeck("Alice", "2024-04-01", nil),
		makeDeck("Bob", "2024-04-01", nil),
	}

	buckets := DeckBuckets(decks, 2, true)
	assert.Equal(t, 2, len(buckets))

	// First bucket should be the earlier drafts (chronological order)
	assert.Equal(t, "2024-01-01", buckets[0].Drafts[0].Name)
	// Second bucket should be the later drafts
	assert.Equal(t, "2024-04-01", buckets[1].Drafts[len(buckets[1].Drafts)-1].Name)
}

func TestDeckBucketsDiscrete_Remainder(t *testing.T) {
	// 3 drafts, bucket size 2 → 1 bucket (remainder of 1 draft is dropped)
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
		makeDeck("Alice", "2024-02-01", nil),
		makeDeck("Alice", "2024-03-01", nil),
	}

	buckets := DeckBuckets(decks, 2, true)
	assert.Equal(t, 1, len(buckets))
	// The bucket includes the last 2 drafts (working backwards)
	assert.Equal(t, 2, len(buckets[0].Drafts))
}

func TestDeckBucketsDiscrete_BucketSizeLargerThanDrafts(t *testing.T) {
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
		makeDeck("Alice", "2024-02-01", nil),
	}

	buckets := DeckBuckets(decks, 10, true)
	assert.Equal(t, 1, len(buckets))
}

func TestDeckBucketsDiscrete_BucketSizeLargerThanDecks(t *testing.T) {
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
	}

	buckets := DeckBuckets(decks, 10, true)
	assert.Equal(t, 1, len(buckets))
	assert.Equal(t, 1, len(buckets[0].AllDecks()))
}

// --- DeckBuckets sliding ---

func TestDeckBucketsSliding_Basic(t *testing.T) {
	// 4 drafts, window size 2 → 3 sliding windows
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
		makeDeck("Alice", "2024-02-01", nil),
		makeDeck("Alice", "2024-03-01", nil),
		makeDeck("Alice", "2024-04-01", nil),
	}

	buckets := DeckBuckets(decks, 2, false)
	assert.Equal(t, 3, len(buckets))

	// First window: draft 1 + 2
	assert.Equal(t, "2024-01-01", buckets[0].Drafts[0].Name)
	assert.Equal(t, "2024-02-01", buckets[0].Drafts[1].Name)

	// Last window: draft 3 + 4
	assert.Equal(t, "2024-03-01", buckets[2].Drafts[0].Name)
	assert.Equal(t, "2024-04-01", buckets[2].Drafts[1].Name)
}

func TestDeckBucketsSliding_WindowLargerThanDrafts(t *testing.T) {
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
		makeDeck("Alice", "2024-02-01", nil),
	}

	buckets := DeckBuckets(decks, 5, false)
	assert.Equal(t, 1, len(buckets))
}

func TestDeckBucketsSliding_GroupsMultipleDecksPerDraft(t *testing.T) {
	// 2 drafts, each with 2 players
	decks := []*storage.Deck{
		makeDeck("Alice", "2024-01-01", nil),
		makeDeck("Bob", "2024-01-01", nil),
		makeDeck("Alice", "2024-02-01", nil),
		makeDeck("Bob", "2024-02-01", nil),
		makeDeck("Alice", "2024-03-01", nil),
		makeDeck("Bob", "2024-03-01", nil),
	}

	buckets := DeckBuckets(decks, 2, false)
	assert.Equal(t, 2, len(buckets))

	// Each bucket should have 2 drafts × 2 players = 4 decks
	assert.Equal(t, 4, len(buckets[0].AllDecks()))
	assert.Equal(t, 4, len(buckets[1].AllDecks()))
}
