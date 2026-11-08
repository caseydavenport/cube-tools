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

	// minPopularityTaken is how many times a card, or a peer, must have been
	// taken to count toward a popularity label.
	minPopularityTaken = 5

	// Draft states on a card's cube history.
	draftPlayed  = "played"
	draftInCube  = "in"
	draftUnknown = "unknown"
	draftOut     = "out"
)

// CardPlay is how much a card gets played in the page's date range, counted
// per copy (see playRates): TimesTaken is the copies decks recording their
// choices took, TimesPlayed those they mainboarded, and Rate the share as a
// percent. Popularity compares Rate with the same-color cube cards, Peers,
// whose median is PeerMedian. Mainboard and Sideboard count decks. Drafts and
// DraftsInCube cover all time.
type CardPlay struct {
	Mainboard    int     `json:"mainboard"`
	Sideboard    int     `json:"sideboard"`
	TimesPlayed  int     `json:"times_played"`
	TimesTaken   int     `json:"times_taken"`
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
// range, and compares its per-draft rate with the same-color cards in cube.
// history supplies the all-time draft counts.
func cardPlay(card types.Card, ranged []*storage.Deck, history []DraftPresence, cube *types.Cube) CardPlay {
	// All-time counts come from the history.
	play := CardPlay{Drafts: len(history), Peers: colorBucket(card)}
	for _, h := range history {
		if h.State == draftPlayed || h.State == draftInCube {
			play.DraftsInCube++
		}
	}

	// Range counts: decks with the card in each board.
	for _, d := range ranged {
		if deckPlays(d, card.Name) {
			play.Mainboard++
		}
		if slices.ContainsFunc(d.Sideboard, func(c types.Card) bool { return c.Name == card.Name }) {
			play.Sideboard++
		}
	}

	// Copies played out of copies taken, against the same-color cards.
	rates := playRates(ranged)
	rate := rates[card.Name]
	play.TimesPlayed, play.TimesTaken = rate.Played, rate.Taken
	if rate.Taken == 0 {
		return play
	}
	play.Rate = round1(rate.percent())
	peers := peerRates(card, cube, rates)
	if len(peers) > 0 {
		play.PeerMedian = median(peers)
	}
	if rate.Taken >= minPopularityTaken {
		play.Popularity = popularity(rate.percent(), peers)
	}
	return play
}

// playRate is one card's play counted in copies: Played of the Taken copies
// that sat in a deck recording its choices were mainboarded. For a singleton
// card that's one copy per draft.
type playRate struct {
	Played int
	Taken  int
}

// percent is the rate as a percent, 0 when no copy was taken.
func (r playRate) percent() float64 {
	if r.Taken == 0 {
		return 0
	}
	return 100 * float64(r.Played) / float64(r.Taken)
}

// playRates counts every non-basic card's play over decks, per copy. A deck
// counts only when it records its choices, a mainboard and a sideboard; one
// with only a pool or only a mainboard can't say whether a card it holds was
// played, so its cards count neither for nor against. Each copy such a deck
// took is taken, each it mainboarded is played, so a card the cube runs more
// than once is judged by every copy.
func playRates(decks []*storage.Deck) map[string]playRate {
	rates := map[string]playRate{}
	for _, d := range decks {
		if !recordsChoices(d) {
			continue
		}
		for _, c := range d.Mainboard {
			if !types.IsBasic(c.Name) {
				r := rates[c.Name]
				r.Taken++
				r.Played++
				rates[c.Name] = r
			}
		}
		for _, c := range d.Sideboard {
			if !types.IsBasic(c.Name) {
				r := rates[c.Name]
				r.Taken++
				rates[c.Name] = r
			}
		}
	}
	return rates
}

// recordsChoices reports whether a deck lists both what it mainboarded and
// what it benched, so a card in it is known to be played or not.
func recordsChoices(d *storage.Deck) bool {
	return len(d.Mainboard) > 0 && len(d.Sideboard) > 0
}

// peerRates lists the rates of the cube cards in card's color bucket, other
// than card, that were taken in at least minPopularityTaken drafts.
func peerRates(card types.Card, cube *types.Cube, rates map[string]playRate) []float64 {
	bucket := colorBucket(card)
	var out []float64
	for _, c := range cube.Cards {
		if c.Name == card.Name || colorBucket(c) != bucket {
			continue
		}
		rate, ok := rates[c.Name]
		if ok && rate.Taken >= minPopularityTaken {
			out = append(out, rate.percent())
		}
	}
	return out
}

// cubePopularity labels every cube card taken in at least
// minPopularityTaken drafts as popular, typical or niche against its color
// peers, keyed by name. Cards without a label are left out.
func cubePopularity(cube *types.Cube, rates map[string]playRate) map[string]string {
	labels := map[string]string{}
	for _, c := range cube.Cards {
		rate, ok := rates[c.Name]
		if !ok || rate.Taken < minPopularityTaken {
			continue
		}
		if label := popularity(rate.percent(), peerRates(c, cube, rates)); label != "" {
			labels[c.Name] = label
		}
	}
	return labels
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
// "typical". Fewer than minPopularityPeers peers, or peers that all share
// one rate, give no label.
func popularity(rate float64, peerRates []float64) string {
	if len(peerRates) < minPopularityPeers {
		return ""
	}
	if slices.Min(peerRates) == slices.Max(peerRates) {
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
	return deckRows(played)
}

// deckRows turns decks into detail-page rows, newest first, for the card and
// package pages' deck lists.
func deckRows(decks []*storage.Deck) []CardDeck {
	sorted := slices.Clone(decks)
	slices.SortFunc(sorted, func(a, b *storage.Deck) int {
		return cmp.Or(cmp.Compare(b.Date, a.Date), cmp.Compare(b.Metadata.DraftID, a.Metadata.DraftID), cmp.Compare(b.ID, a.ID))
	})

	out := []CardDeck{}
	for _, d := range sorted {
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
