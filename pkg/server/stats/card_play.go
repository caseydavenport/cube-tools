package stats

import (
	"cmp"
	"fmt"
	"maps"
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	// minPopularityPeers is how many same-color cards a card needs to be
	// compared against before it gets a popular, typical or niche label.
	minPopularityPeers = 10

	// Draft states on a card's cube history.
	draftPlayed  = "played"
	draftInCube  = "in"
	draftUnknown = "unknown"
	draftOut     = "out"
)

// CardPlay is how much a card gets played in the page's date range.
// Available counts the decks from drafts whose cube had the card. Rate is
// Mainboard as a percent of Available, and Popularity compares it with the
// other cube cards of the same color group, Peers, whose median is PeerMedian.
// Drafts and DraftsInCube cover all time.
type CardPlay struct {
	Mainboard    int     `json:"mainboard"`
	Available    int     `json:"available"`
	Sideboard    int     `json:"sideboard"`
	DraftsInCube int     `json:"drafts_in_cube"`
	Drafts       int     `json:"drafts"`
	Popularity   string  `json:"popularity"`
	Rate         float64 `json:"rate"`
	PeerMedian   float64 `json:"peer_median"`
	Peers        string  `json:"peers"`
}

// DraftPresence is one draft on a card's cube history: "played" when a deck
// mainboarded it, "in" when the draft's cube list held it, "unknown" when the
// draft has no cube list, else "out". InRange marks drafts in the page's
// date range.
type DraftPresence struct {
	DraftID int    `json:"draft_id"`
	Date    string `json:"date"`
	State   string `json:"state"`
	InRange bool   `json:"in_range"`
}

// CardDeck is one deck that played a card, with its match record. Ref is
// "<draft>/<deck>", the Decks page's id for it.
type CardDeck struct {
	Ref       string `json:"ref"`
	Date      string `json:"date"`
	Player    string `json:"player"`
	Colors    string `json:"colors"`
	Archetype string `json:"archetype"`
	Wins      int    `json:"wins"`
	Losses    int    `json:"losses"`
	Draws     int    `json:"draws"`
}

// draftHistory lists every draft with decks, in draft order, and whether the
// card was played in it, in its cube, unknown or out. start and end, either
// empty for open, set each draft's InRange.
func draftHistory(card string, all []*storage.Deck, cubes cubeLists, start, end string) []DraftPresence {
	dates := map[int]string{}
	played := map[int]bool{}
	for _, d := range all {
		draftID := d.Metadata.DraftID
		if _, ok := dates[draftID]; !ok {
			dates[draftID] = d.Date
		}
		if deckPlays(d, card) {
			played[draftID] = true
		}
	}

	out := []DraftPresence{}
	for _, draftID := range slices.Sorted(maps.Keys(dates)) {
		date := dates[draftID]
		out = append(out, DraftPresence{
			DraftID: draftID,
			Date:    date,
			State:   draftState(card, draftID, played[draftID], cubes),
			InRange: (start == "" || date >= start) && (end == "" || date <= end),
		})
	}
	return out
}

// draftState names one draft's state on a card's cube history.
func draftState(card string, draftID int, played bool, cubes cubeLists) string {
	if played {
		return draftPlayed
	}
	list, ok := cubes[draftID]
	if !ok {
		return draftUnknown
	}
	if list[card] {
		return draftInCube
	}
	return draftOut
}

// deckPlays reports whether the deck mainboarded the card.
func deckPlays(d *storage.Deck, card string) bool {
	return slices.ContainsFunc(d.Mainboard, func(c types.Card) bool { return c.Name == card })
}

// cardPlay counts a card's play over ranged, the decks in the page's date
// range, and compares its rate with the same-color cards in cube. history
// supplies the all-time draft counts.
func cardPlay(card types.Card, ranged []deckSpells, history []DraftPresence, cube *types.Cube, cubes cubeLists) CardPlay {
	play := CardPlay{Drafts: len(history), Peers: colorBucket(card)}
	for _, h := range history {
		if h.State == draftPlayed || h.State == draftInCube {
			play.DraftsInCube++
		}
	}

	play.Mainboard, play.Available = countWithCard(ranged, card.Name, cubes)
	for _, d := range ranged {
		if slices.ContainsFunc(d.deck.Sideboard, func(c types.Card) bool { return c.Name == card.Name }) {
			play.Sideboard++
		}
	}
	if play.Available == 0 {
		return play
	}
	play.Rate = round1(100 * float64(play.Mainboard) / float64(play.Available))

	var peerRates []float64
	for _, c := range cube.Cards {
		if c.Name == card.Name || c.IsBasicLand() || colorBucket(c) != play.Peers {
			continue
		}
		with, available := countWithCard(ranged, c.Name, cubes)
		if available > 0 {
			peerRates = append(peerRates, 100*float64(with)/float64(available))
		}
	}
	if len(peerRates) > 0 {
		play.PeerMedian = median(peerRates)
	}
	play.Popularity = popularity(play.Rate, peerRates)
	return play
}

// colorBucket groups a card with others of its color: "W" through "G" for one
// color, "M" for several, "C" for none.
func colorBucket(c types.Card) string {
	switch len(c.Colors) {
	case 0:
		return "C"
	case 1:
		return c.Colors[0]
	default:
		return "M"
	}
}

// popularity labels a mainboard rate against its peers' rates: "popular" when
// at least two thirds of them are lower, "niche" when under a third are, else
// "typical". Fewer than minPopularityPeers peers gives no label.
func popularity(rate float64, peerRates []float64) string {
	if len(peerRates) < minPopularityPeers {
		return ""
	}
	below := 0
	for _, r := range peerRates {
		if r < rate {
			below++
		}
	}
	share := float64(below) / float64(len(peerRates))
	if share >= 2.0/3.0 {
		return "popular"
	}
	if share < 1.0/3.0 {
		return "niche"
	}
	return "typical"
}

// cardDecks lists the decks that mainboarded the card, newest first.
func cardDecks(card string, ranged []*storage.Deck) []CardDeck {
	var played []*storage.Deck
	for _, d := range ranged {
		if deckPlays(d, card) {
			played = append(played, d)
		}
	}
	slices.SortFunc(played, func(a, b *storage.Deck) int {
		return cmp.Or(cmp.Compare(b.Date, a.Date), cmp.Compare(b.Metadata.DraftID, a.Metadata.DraftID), cmp.Compare(b.ID, a.ID))
	})

	out := []CardDeck{}
	for _, d := range played {
		out = append(out, CardDeck{
			Ref:       fmt.Sprintf("%d/%d", d.Metadata.DraftID, d.ID),
			Date:      d.Date,
			Player:    d.PersonLabel(),
			Colors:    d.GetColors().String(),
			Archetype: d.MacroArchetype,
			Wins:      d.MatchWins(),
			Losses:    d.MatchLosses(),
			Draws:     d.MatchDraws(),
		})
	}
	return out
}

// whoPlays counts the colors, archetypes and named players of the decks that
// mainboarded the card, most common first. Decks without an archetype and
// anonymous seats are left out of those counts.
func whoPlays(card string, ranged []*storage.Deck) ([]NamedCount, []NamedCount, []NamedCount) {
	numByColors := map[string]int{}
	numByArchetype := map[string]int{}
	numByPlayer := map[string]int{}
	for _, d := range ranged {
		if !deckPlays(d, card) {
			continue
		}
		numByColors[d.GetColors().String()]++
		if d.MacroArchetype != "" {
			numByArchetype[d.MacroArchetype]++
		}
		if !d.IsAnonymous() {
			numByPlayer[d.Player]++
		}
	}
	return sortedCounts(numByColors), sortedCounts(numByArchetype), sortedCounts(numByPlayer)
}
