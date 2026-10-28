package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// gameDeck returns a draft 1 deck with the given mainboard and games.
func gameDeck(player string, mainboard []types.Card, games ...types.Game) *storage.Deck {
	d := makeStorageDeck(player, 1, nil, games, nil)
	d.Mainboard = mainboard
	return d
}

// won returns a game against opponent that winner won.
func won(opponent, winner string) types.Game {
	return types.Game{Opponent: opponent, Winner: winner}
}

// spellsAt returns one nonland card per mana value given.
func spellsAt(cmcs ...int) []types.Card {
	var out []types.Card
	for _, cmc := range cmcs {
		out = append(out, spell("Sorcery", cmc, ""))
	}
	return out
}

// gapBucket returns the bucket labeled label, failing when it's missing.
func gapBucket(t *testing.T, buckets []*GapBucket, label string) *GapBucket {
	t.Helper()
	for _, b := range buckets {
		if b.Label == label {
			return b
		}
	}
	require.Failf(t, "missing bucket", "no bucket %q", label)
	return nil
}

// creatureFeature is the creatures entry of headToHeadFeatures.
func creatureFeature(t *testing.T) deckFeature {
	t.Helper()
	for _, f := range headToHeadFeatures {
		if f.Key == "creatures" {
			return f
		}
	}
	require.Fail(t, "no creatures feature")
	return deckFeature{}
}

// gamesIn totals every bucket's wins and losses.
func gamesIn(buckets []*GapBucket) int {
	total := 0
	for _, b := range buckets {
		total += b.Wins + b.Losses
	}
	return total
}

func TestHeadToHead_CountsMoreFeatureSide(t *testing.T) {
	ozzy := gameDeck("Ozzy", creatures(5), won("Stevie", "Ozzy"), won("Stevie", "Ozzy"), won("Stevie", "Stevie"))
	stevie := gameDeck("Stevie", creatures(2), won("Ozzy", "Ozzy"), won("Ozzy", "Ozzy"), won("Ozzy", "Stevie"))
	decks := []*storage.Deck{ozzy, stevie}

	buckets := headToHead(decks, decks, creatureFeature(t), 1.96)
	b := gapBucket(t, buckets, "3")
	assert.Equal(t, 2, b.Wins)
	assert.Equal(t, 1, b.Losses)
	assert.Equal(t, 3, gamesIn(buckets))
}

func TestHeadToHead_OpponentOutsideFilter(t *testing.T) {
	stevie := gameDeck("Stevie", creatures(5), won("Ozzy", "Stevie"), won("Ozzy", "Ozzy"), won("Ozzy", "Ozzy"))
	ozzy := gameDeck("Ozzy", creatures(2))

	buckets := headToHead([]*storage.Deck{stevie}, []*storage.Deck{stevie, ozzy}, creatureFeature(t), 1.96)
	b := gapBucket(t, buckets, "3")
	assert.Equal(t, 1, b.Wins)
	assert.Equal(t, 2, b.Losses)
}

func TestHeadToHead_OpponentMissingFromAllDecks(t *testing.T) {
	stevie := gameDeck("Stevie", creatures(5), won("Ozzy", "Stevie"))
	buckets := headToHead([]*storage.Deck{stevie}, []*storage.Deck{stevie}, creatureFeature(t), 1.96)
	assert.Equal(t, 0, gamesIn(buckets))
}

func TestHeadToHead_SkipsOpponentWithoutDecklist(t *testing.T) {
	ozzy := gameDeck("Ozzy", creatures(5), won("Stevie", "Ozzy"))
	stevie := gameDeck("Stevie", nil)
	decks := []*storage.Deck{ozzy, stevie}

	buckets := headToHead(decks, decks, creatureFeature(t), 1.96)
	assert.Equal(t, 0, gamesIn(buckets))
}

func TestHeadToHead_SkipsDraws(t *testing.T) {
	ozzy := gameDeck("Ozzy", creatures(5), types.Game{Opponent: "Stevie", Tie: true})
	stevie := gameDeck("Stevie", creatures(2))
	decks := []*storage.Deck{ozzy, stevie}

	buckets := headToHead(decks, decks, creatureFeature(t), 1.96)
	assert.Equal(t, 0, gamesIn(buckets))
}

func TestHeadToHead_IntegerBucketsOpenEnded(t *testing.T) {
	ozzy := gameDeck("Ozzy", creatures(9), won("Stevie", "Ozzy"))
	stevie := gameDeck("Stevie", creatures(1))
	decks := []*storage.Deck{ozzy, stevie}

	buckets := headToHead(decks, decks, creatureFeature(t), 1.96)
	var labels []string
	for _, b := range buckets {
		labels = append(labels, b.Label)
	}
	assert.Equal(t, []string{"1", "2", "3", "4", "5", "6+"}, labels)
	assert.Equal(t, 1, gapBucket(t, buckets, "6+").Wins)
}

func TestHeadToHead_ManaValueBuckets(t *testing.T) {
	// Ozzy averages 2.0. Stevie is 0.2 higher, Joan 0.5 and Freddie 1.4.
	ozzy := gameDeck("Ozzy", spellsAt(2))
	stevie := gameDeck("Stevie", spellsAt(2, 2, 2, 2, 3), won("Ozzy", "Stevie"))
	joan := gameDeck("Joan", spellsAt(2, 3), won("Ozzy", "Joan"))
	freddie := gameDeck("Freddie", spellsAt(3, 3, 4, 4, 3), won("Ozzy", "Freddie"))
	decks := []*storage.Deck{ozzy, stevie, joan, freddie}

	buckets := headToHead(decks, decks, forestFeatures[0], 1.96)
	assert.Equal(t, 1, gapBucket(t, buckets, "0.25").Wins)
	assert.Equal(t, 1, gapBucket(t, buckets, "0.5").Wins)
	assert.Equal(t, 0, gapBucket(t, buckets, "0.75").Wins)
	assert.Equal(t, 1, gapBucket(t, buckets, "1.0+").Wins)
}

// closeRow returns the close-match row for archetype.
func closeRow(t *testing.T, rows []*CloseMatchRow, archetype string) *CloseMatchRow {
	t.Helper()
	for _, r := range rows {
		if r.Archetype == archetype {
			return r
		}
	}
	require.Failf(t, "missing row", "no close-match row %q", archetype)
	return nil
}

func TestCloseMatches_Rate(t *testing.T) {
	d := gameDeck("Ozzy", creatures(1))
	d.MacroArchetype = "aggro"
	d.Matches = []types.Match{{Wins: 2, Losses: 1}, {Wins: 2}, {}}

	rows := closeMatches([]*storage.Deck{d}, 1.96)
	row := closeRow(t, rows, "aggro")
	assert.Equal(t, 2, row.Matches)
	assert.Equal(t, 1, row.Close)
	assert.Equal(t, 50.0, row.Percent)
	assert.Less(t, row.PercentLow, 50.0)
	assert.Greater(t, row.PercentHigh, 50.0)
	assert.Equal(t, 0, closeRow(t, rows, "control").Matches)
}
