package stats

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

type mockDeckStorage struct {
	decks []*storage.Deck
}

func (m *mockDeckStorage) List(_ string, _ *storage.DecksRequest) ([]*storage.Deck, error) {
	return m.decks, nil
}

func (m *mockDeckStorage) UpdateDeckMeta(_ string, _ storage.DeckMetaWrite) (*storage.Deck, error) {
	return nil, nil
}

func (m *mockDeckStorage) GetRules(_ string) (*design.DesignMapConfig, error) {
	return nil, storage.ErrUnsupported
}

// GetOverrides reports no forced packages.
func (m *mockDeckStorage) GetOverrides(_ string) (design.PackageOverrides, error) {
	return design.PackageOverrides{}, nil
}

// GetSnapshot reports no snapshot for any draft.
func (m *mockDeckStorage) GetSnapshot(_ string, _ int) (*types.Cube, error) {
	return nil, storage.ErrDeckNotFound
}

func makeStorageDeck(player string, draftID int, labels []string, games []types.Game, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Labels = labels
	d.Matches = matches
	foldGamesIntoMatches(d, player, games)
	return d
}

// foldGamesIntoMatches places each game inside its corresponding Match (by opponent),
// updates Wins/Losses/Draws counters, and rebuilds the storage Deck's flat Games slice.
func foldGamesIntoMatches(d *storage.Deck, player string, games []types.Game) {
	for _, g := range games {
		placed := false
		for i := range d.Matches {
			if d.Matches[i].Opponent == g.Opponent {
				d.Matches[i].Games = append(d.Matches[i].Games, g)
				switch {
				case g.Winner == player:
					d.Matches[i].Wins++
				case g.Winner == "" || g.Tie:
					d.Matches[i].Draws++
				default:
					d.Matches[i].Losses++
				}
				placed = true
				break
			}
		}
		if !placed {
			m := types.Match{Opponent: g.Opponent, Games: []types.Game{g}}
			switch {
			case g.Winner == player:
				m.Wins = 1
			case g.Winner == "" || g.Tie:
				m.Draws = 1
			default:
				m.Losses = 1
			}
			d.Matches = append(d.Matches, m)
		}
	}

	d.Games = make([]types.Game, 0)
	for _, m := range d.Matches {
		d.Games = append(d.Games, m.Games...)
	}
}

func TestArchetypeStats_SharedWith_MacroSkip(t *testing.T) {
	d := makeStorageDeck("Freddie", 1, []string{"spells"}, []types.Game{
		{Opponent: "Ozzy", Winner: "Freddie"},
	}, []types.Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
	})
	d.MacroArchetype = "control"
	decks := []*storage.Deck{d}

	resp := getArchetypes(t, decks, "")

	// The macro archetype must not leak into a secondary label's SharedWith.
	spells := resp.Archetypes["spells"]
	assert.NotNil(t, spells)
	_, hasControl := spells.SharedWith["control"]
	assert.False(t, hasControl, "macro archetype should be excluded from SharedWith")

	// The macro archetype's own SharedWith does include secondary labels.
	control := resp.Archetypes["control"]
	assert.NotNil(t, control)
	assert.Equal(t, 1, control.SharedWith["spells"])
}

func TestArchetypeStats_WinPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Freddie", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Ozzy"},
		}, nil),
		makeStorageDeck("Ozzy", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Freddie", Winner: "Ozzy"},
		}, nil),
	}

	resp := getArchetypes(t, decks, "")

	aggro := resp.Archetypes["aggro"]
	assert.NotNil(t, aggro)

	// 3 wins, 3 losses is 50%
	assert.InDelta(t, 50.0, aggro.WinPercent, 0.5)
}

func TestArchetypeStats_TotalGames(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Freddie", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Ozzy"},
		}, nil),
		makeStorageDeck("Ozzy", 1, []string{"control"}, []types.Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Freddie", Winner: "Ozzy"},
		}, nil),
	}

	resp := getArchetypes(t, decks, "")

	// Each game is counted once as a win for the winning deck.
	// Freddie: 1 win, Ozzy: 1 win → totalGames = 2 (sum of GameWins across all decks)
	assert.Equal(t, 2, resp.TotalGames)
}

// A deck labeled both "aggro" and "control" contributes its wins to both
// buckets. The PercentOfWins denominator must inflate the same way so the
// column actually sums to ~100% across rows. Small drift comes from
// per-row math.Round and is bounded by the number of rows.
func TestArchetypeStats_PercentOfWinsSumsTo100(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Freddie", 1, []string{"aggro", "control"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Freddie"},
		}, nil),
		makeStorageDeck("Ozzy", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Freddie", Winner: "Ozzy"},
			{Opponent: "Freddie", Winner: "Freddie"},
		}, nil),
		makeStorageDeck("Debbie", 2, []string{"midrange", "ramp"}, []types.Game{
			{Opponent: "Joan", Winner: "Debbie"},
			{Opponent: "Joan", Winner: "Debbie"},
		}, nil),
	}

	resp := getArchetypes(t, decks, "")

	sum := 0.0
	rows := 0
	for _, a := range resp.Archetypes {
		if a.Count == 0 {
			continue
		}
		sum += a.PercentOfWins
		rows++
	}
	assert.InDelta(t, 100.0, sum, float64(rows), "PercentOfWins sum: %v", sum)
}

// getArchetypes runs the archetypes handler with the given query string and
// decodes its answer.
func getArchetypes(t *testing.T, decks []*storage.Deck, query string) ArchetypeStatsResponse {
	t.Helper()
	handler := &archetypeStatsHandler{q: deckquery.New(&mockDeckStorage{decks: decks}, testCubeSource{})}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes"+query, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	assert.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return resp
}

// Archetype rows shrink toward 50% by a 90-game prior.
func TestArchetypeStats_BayesianWinPercent(t *testing.T) {
	var games []types.Game
	for range 9 {
		games = append(games, types.Game{Opponent: "Ozzy", Winner: "Freddie"})
	}
	games = append(games, types.Game{Opponent: "Ozzy", Winner: "Ozzy"})
	decks := []*storage.Deck{makeStorageDeck("Freddie", 1, []string{"ramp"}, games, nil)}

	resp := getArchetypes(t, decks, "")

	// (9 + 45) / (10 + 90) = 54%
	assert.Equal(t, 54.0, resp.Archetypes["ramp"].BayesianWinPercent)
}

// With bucket_size set, the answer is one set of archetype rows per time
// bucket, labeled by the bucket's first draft date.
func TestArchetypeStats_Buckets(t *testing.T) {
	first := makeStorageDeck("Freddie", 1, []string{"ramp"}, []types.Game{{Opponent: "Ozzy", Winner: "Freddie"}}, nil)
	first.Date = "2026-01-01"
	second := makeStorageDeck("Freddie", 2, []string{"token"}, []types.Game{{Opponent: "Ozzy", Winner: "Ozzy"}}, nil)
	second.Date = "2026-02-01"

	resp := getArchetypes(t, []*storage.Deck{first, second}, "?bucket_size=1&sliding=true")

	assert.Len(t, resp.Buckets, 2)
	assert.Equal(t, "2026-01-01", resp.Buckets[0].Start)
	assert.Equal(t, 1, resp.Buckets[0].Archetypes["ramp"].Count)
	assert.NotContains(t, resp.Buckets[0].Archetypes, "token")
	assert.Equal(t, "2026-02-01", resp.Buckets[1].Start)
	assert.Equal(t, 1, resp.Buckets[1].Archetypes["token"].Count)
}

// The macro archetype is added to the deck's own tags to build its rows, and
// that mustn't write into the deck's Labels slice, which other rows share.
func TestArchetypeStats_LeavesDeckLabelsAlone(t *testing.T) {
	labels := make([]string, 1, 4)
	labels[0] = "spells"
	d := makeStorageDeck("Freddie", 1, labels, nil, nil)
	d.MacroArchetype = "control"

	getArchetypes(t, []*storage.Deck{d}, "")

	assert.Equal(t, []string{"spells"}, d.Labels)
	assert.Empty(t, labels[:cap(labels)][1], "the macro archetype was written past the end of Labels")
}

// A row averages mana value over decks with a nonland card, so a deck of only
// lands doesn't pull the average toward zero.
func TestArchetypeStats_AvgCMCSkipsLandOnlyDecks(t *testing.T) {
	spells := makeStorageDeck("Freddie", 1, []string{"ramp"}, nil, nil)
	spells.Mainboard = []types.Card{{Name: "Cultivate", Types: []string{"Sorcery"}, CMC: 3}}
	lands := makeStorageDeck("Ozzy", 1, []string{"ramp"}, nil, nil)
	lands.Mainboard = []types.Card{{Name: "Forest", Types: []string{"Basic", "Land"}}}

	resp := getArchetypes(t, []*storage.Deck{spells, lands}, "")

	require.Equal(t, 2, resp.Archetypes["ramp"].Count)
	assert.Equal(t, 3.0, resp.Archetypes["ramp"].AvgCMC)
}

// The macro archetypes get a row even when no deck carries them.
func TestArchetypeStats_MacroRowsAlwaysPresent(t *testing.T) {
	resp := getArchetypes(t, nil, "")

	for _, macro := range macroArchetypes {
		assert.Contains(t, resp.Archetypes, macro)
	}
}
