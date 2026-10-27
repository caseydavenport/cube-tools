package stats

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
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

// --- SharedWith: macro archetype excluded ---

func TestArchetypeStats_SharedWith_MacroSkip(t *testing.T) {
	d := makeStorageDeck("Alice", 1, []string{"spells"}, []types.Game{
		{Opponent: "Bob", Winner: "Alice"},
	}, []types.Match{
		{Opponent: "Bob", Winner: "Alice"},
	})
	d.MacroArchetype = "control"
	decks := []*storage.Deck{d}

	handler := &archetypeStatsHandler{q: newQuery(&mockDeckStorage{decks: decks}, testCubeSource{})}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

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

// --- WinPercent ---

func TestArchetypeStats_WinPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
		}, nil),
		makeStorageDeck("Bob", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Bob"},
		}, nil),
	}

	handler := &archetypeStatsHandler{q: newQuery(&mockDeckStorage{decks: decks}, testCubeSource{})}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	aggro := resp.Archetypes["aggro"]
	assert.NotNil(t, aggro)
	// 3 wins, 3 losses → 50%
	assert.InDelta(t, 50.0, aggro.WinPercent, 0.5)
}

// --- TotalGames equals totalWins (no double-counting) ---

func TestArchetypeStats_TotalGames(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
		}, nil),
		makeStorageDeck("Bob", 1, []string{"control"}, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Bob"},
		}, nil),
	}

	handler := &archetypeStatsHandler{q: newQuery(&mockDeckStorage{decks: decks}, testCubeSource{})}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	// Each game is counted once as a win for the winning deck.
	// Alice: 1 win, Bob: 1 win → totalGames = 2 (sum of GameWins across all decks)
	assert.Equal(t, 2, resp.TotalGames)
}

// A deck labeled both "aggro" and "control" contributes its wins to both
// buckets. The PercentOfWins denominator must inflate the same way so the
// column actually sums to ~100% across rows. Small drift comes from
// per-row math.Round and is bounded by the number of rows.
func TestArchetypeStats_PercentOfWinsSumsTo100(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro", "control"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Alice"},
		}, nil),
		makeStorageDeck("Bob", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Alice", Winner: "Bob"},
			{Opponent: "Alice", Winner: "Alice"},
		}, nil),
		makeStorageDeck("Carol", 2, []string{"midrange", "ramp"}, []types.Game{
			{Opponent: "Dave", Winner: "Carol"},
			{Opponent: "Dave", Winner: "Carol"},
		}, nil),
	}

	handler := &archetypeStatsHandler{q: newQuery(&mockDeckStorage{decks: decks}, testCubeSource{})}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

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
	handler := &archetypeStatsHandler{q: newQuery(&mockDeckStorage{decks: decks}, testCubeSource{})}
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
		games = append(games, types.Game{Opponent: "Bob", Winner: "Alice"})
	}
	games = append(games, types.Game{Opponent: "Bob", Winner: "Bob"})
	decks := []*storage.Deck{makeStorageDeck("Alice", 1, []string{"ramp"}, games, nil)}

	resp := getArchetypes(t, decks, "")

	// (9 + 45) / (10 + 90) = 54%
	assert.Equal(t, 54.0, resp.Archetypes["ramp"].BayesianWinPercent)
}

// With bucket_size set, the answer is one set of archetype rows per time
// bucket, labeled by the bucket's first draft date.
func TestArchetypeStats_Buckets(t *testing.T) {
	first := makeStorageDeck("Alice", 1, []string{"ramp"}, []types.Game{{Opponent: "Bob", Winner: "Alice"}}, nil)
	first.Date = "2026-01-01"
	second := makeStorageDeck("Alice", 2, []string{"token"}, []types.Game{{Opponent: "Bob", Winner: "Bob"}}, nil)
	second.Date = "2026-02-01"

	resp := getArchetypes(t, []*storage.Deck{first, second}, "?bucket_size=1&sliding=true")

	assert.Len(t, resp.Buckets, 2)
	assert.Equal(t, "2026-01-01", resp.Buckets[0].Start)
	assert.Equal(t, 1, resp.Buckets[0].Archetypes["ramp"].Count)
	assert.NotContains(t, resp.Buckets[0].Archetypes, "token")
	assert.Equal(t, "2026-02-01", resp.Buckets[1].Start)
	assert.Equal(t, 1, resp.Buckets[1].Archetypes["token"].Count)
}
