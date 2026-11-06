package stats

import (
	"cmp"
	"net/http"
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ArchetypePageResponse is one archetype's or tag's page: its row from the
// Archetypes table, the cards its decks play, the other tags, colors and
// players on its decks, its share of decks per draft, and its decks.
type ArchetypePageResponse struct {
	Name     string          `json:"name"`
	Stats    *ArchetypeStats `json:"stats"`
	TopCards []ArchetypeCard `json:"top_cards"`
	Paired   []NamedCount    `json:"paired"`
	Colors   []NamedCount    `json:"colors"`
	Players  []NamedCount    `json:"players"`
	OverTime []DraftBuild    `json:"over_time"`
	Decks    []CardDeck      `json:"decks"`
}

// ArchetypeCard is one card the archetype's decks mainboarded. Decks counts
// those decks, InShare is them as a percent of the archetype's decks, and
// OfCardDecks is them as a percent of every deck that played the card. Fit
// multiplies the two shares, so it's high for a card the archetype plays often
// and other decks rarely do.
type ArchetypeCard struct {
	Name        string  `json:"name"`
	Land        bool    `json:"land"`
	Decks       int     `json:"decks"`
	InShare     float64 `json:"in_share"`
	OfCardDecks float64 `json:"of_card_decks"`
	Fit         float64 `json:"fit"`
}

// ArchetypePageHandler serves /stats/archetype: one archetype's or tag's page
// over the start and end dates in the request. Like the card page, it ignores
// the deck filter, since the page is about the archetype, not a slice of decks.
func ArchetypePageHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &archetypePageHandler{q: newQuery(store, src)}
}

type archetypePageHandler struct {
	q *deckquery.Query
}

// ServeHTTP answers one archetype page request: 404 for a name no deck has
// ever carried, else the page's data as JSON.
func (h *archetypePageHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cubeID := server.CubeFromRequest(r)
	name := query.GetString(r, "name")
	start := query.GetString(r, "start")
	end := query.GetString(r, "end")
	logrus.WithField("archetype", name).Info("/api/stats/archetype")

	all, err := h.q.Decks(cubeID, &storage.DecksRequest{})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	if !slices.ContainsFunc(all, func(d *storage.Deck) bool { return hasArchetype(d, name) }) {
		http.Error(rw, "unknown archetype", http.StatusNotFound)
		return
	}
	ranged, err := h.q.Decks(cubeID, &storage.DecksRequest{Start: start, End: end})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	z := zForConfidence(query.GetFloat(r, "confidence"))
	writeJSON(rw, buildArchetypePage(name, all, ranged, start, end, z), "archetype page")
}

// buildArchetypePage computes the page for the named archetype from every
// deck (for the per-draft share) and the decks in the date range (for the
// rest). z is the critical value for the win-rate interval.
func buildArchetypePage(name string, all, ranged []*storage.Deck, start, end string, z float64) ArchetypePageResponse {
	var mine []*storage.Deck
	for _, d := range ranged {
		if hasArchetype(d, name) {
			mine = append(mine, d)
		}
	}

	stats := archetypeStatsForDecks(ranged, z).Archetypes[name]
	if stats == nil {
		stats = &ArchetypeStats{Type: name, SharedWith: map[string]int{}, Players: map[string]int{}}
	}

	page := ArchetypePageResponse{
		Name:     name,
		Stats:    stats,
		TopCards: archetypeCards(mine, ranged),
		OverTime: draftShares(all, start, end, func(d *storage.Deck) bool { return hasArchetype(d, name) }),
		Decks:    deckRows(mine),
	}
	page.Paired, page.Colors, page.Players = archetypeTraits(name, mine)
	return page
}

// hasArchetype reports whether the deck carries name as its macro archetype
// or as one of its tags.
func hasArchetype(d *storage.Deck, name string) bool {
	return d.MacroArchetype == name || slices.Contains(d.Labels, name)
}

// archetypeCards lists every non-basic card mine mainboarded, with how its
// count there compares to the archetype's decks and to every deck in ranged
// that played it. Rows are ordered by Fit, then by decks, then by name.
func archetypeCards(mine, ranged []*storage.Deck) []ArchetypeCard {
	// Every deck's plays, for the share of a card's decks in the archetype.
	numByCard := map[string]int{}
	for _, d := range ranged {
		for name := range distinctSpells(d) {
			numByCard[name]++
		}
	}

	// The archetype's plays, noting lands so the page can hide them.
	numInArchetype := map[string]int{}
	lands := map[string]bool{}
	for _, d := range mine {
		for name := range distinctSpells(d) {
			numInArchetype[name]++
		}
		for _, c := range d.Mainboard {
			if c.IsLand() {
				lands[c.Name] = true
			}
		}
	}

	// One row per card, best fit first.
	out := []ArchetypeCard{}
	for name, n := range numInArchetype {
		inShare := 100 * float64(n) / float64(len(mine))
		ofCard := 100 * float64(n) / float64(numByCard[name])
		out = append(out, ArchetypeCard{
			Name:        name,
			Land:        lands[name],
			Decks:       n,
			InShare:     round1(inShare),
			OfCardDecks: round1(ofCard),
			Fit:         round1(inShare * ofCard / 100),
		})
	}
	slices.SortFunc(out, func(a, b ArchetypeCard) int {
		return cmp.Or(cmp.Compare(b.Fit, a.Fit), cmp.Compare(b.Decks, a.Decks), cmp.Compare(a.Name, b.Name))
	})
	return out
}

// archetypeTraits counts, over the archetype's decks, the other archetypes
// and tags they carry, their colors, and their named players, most common
// first. Anonymous seats are left out of the players.
func archetypeTraits(name string, mine []*storage.Deck) ([]NamedCount, []NamedCount, []NamedCount) {
	numByPaired := map[string]int{}
	numByColors := map[string]int{}
	numByPlayer := map[string]int{}
	for _, d := range mine {
		if d.MacroArchetype != "" && d.MacroArchetype != name {
			numByPaired[d.MacroArchetype]++
		}
		for _, label := range d.Labels {
			if label != name {
				numByPaired[label]++
			}
		}
		numByColors[d.GetColors().String()]++
		if !d.IsAnonymous() {
			numByPlayer[d.Player]++
		}
	}
	return sortedCounts(numByPaired), sortedCounts(numByColors), sortedCounts(numByPlayer)
}
