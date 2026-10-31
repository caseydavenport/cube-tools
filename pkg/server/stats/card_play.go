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

	// minPopularityDrafts is how many drafts a card, or a peer, must have been
	// available in to count toward a popularity label. It matches the UI's
	// "New to the cube" cutoff.
	minPopularityDrafts = 5

	// Draft states on a card's cube history.
	draftPlayed  = "played"
	draftInCube  = "in"
	draftUnknown = "unknown"
	draftOut     = "out"
)

// CardPlay is how much a card gets played in the page's date range, counted
// in drafts: a singleton card can be in only one deck per draft. DraftsPlayed
// counts drafts where a deck mainboarded it, out of DraftsAvailable, the
// drafts whose cube had it; Rate is that as a percent. Popularity compares Rate
// with the other cube cards of the same color group, Peers, whose median is
// PeerMedian. Mainboard and Sideboard count decks. Drafts and DraftsInCube
// cover all time.
type CardPlay struct {
	Mainboard       int     `json:"mainboard"`
	Sideboard       int     `json:"sideboard"`
	DraftsPlayed    int     `json:"drafts_played"`
	DraftsAvailable int     `json:"drafts_available"`
	DraftsInCube    int     `json:"drafts_in_cube"`
	Drafts          int     `json:"drafts"`
	Popularity      string  `json:"popularity"`
	Rate            float64 `json:"rate"`
	PeerMedian      float64 `json:"peer_median"`
	Peers           string  `json:"peers"`
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
func cardPlay(card types.Card, ranged []deckSpells, history []DraftPresence, cube *types.Cube, cubes cubeLists) CardPlay {
	// All-time counts come from the history.
	play := CardPlay{Drafts: len(history), Peers: colorBucket(card)}
	for _, h := range history {
		if h.State == draftPlayed || h.State == draftInCube {
			play.DraftsInCube++
		}
	}

	// Range counts: decks with the card, then drafts played out of available.
	play.Mainboard, _ = countWithCard(ranged, card.Name, cubes)
	for _, d := range ranged {
		if slices.ContainsFunc(d.deck.Sideboard, func(c types.Card) bool { return c.Name == card.Name }) {
			play.Sideboard++
		}
	}

	byDraft := listedDrafts(decksByDraft(ranged), cubes)
	play.DraftsPlayed, play.DraftsAvailable = draftsWithCard(byDraft, card.Name, cubes)
	if play.DraftsAvailable == 0 {
		return play
	}
	rate := 100 * float64(play.DraftsPlayed) / float64(play.DraftsAvailable)
	play.Rate = round1(rate)

	// Compare against the median rate of same-color cube cards.
	var peerRates []float64
	for _, c := range cube.Cards {
		if c.Name == card.Name || c.IsBasicLand() || colorBucket(c) != play.Peers {
			continue
		}
		played, available := draftsWithCard(byDraft, c.Name, cubes)
		if available >= minPopularityDrafts {
			peerRates = append(peerRates, 100*float64(played)/float64(available))
		}
	}
	if len(peerRates) > 0 {
		play.PeerMedian = median(peerRates)
	}
	if play.DraftsAvailable >= minPopularityDrafts {
		play.Popularity = popularity(rate, peerRates)
	}
	return play
}

// listedDrafts drops the drafts with no cube list when any draft has one,
// since a missing list can't say whether a card went unplayed or was absent.
// With no lists at all it keeps every draft, and each card counts as
// available in all of them.
func listedDrafts(byDraft map[int][]deckSpells, cubes cubeLists) map[int][]deckSpells {
	out := map[int][]deckSpells{}
	for draftID, decks := range byDraft {
		if _, ok := cubes[draftID]; ok {
			out[draftID] = decks
		}
	}
	if len(out) == 0 {
		return byDraft
	}
	return out
}

// decksByDraft groups decks by their draft.
func decksByDraft(decks []deckSpells) map[int][]deckSpells {
	out := map[int][]deckSpells{}
	for _, d := range decks {
		draftID := d.deck.Metadata.DraftID
		out[draftID] = append(out[draftID], d)
	}
	return out
}

// draftsWithCard counts the drafts whose cube had the card, and how many of
// those had a deck mainboard it. A deck that played it proves its draft had it.
func draftsWithCard(byDraft map[int][]deckSpells, card string, cubes cubeLists) (int, int) {
	played, available := 0, 0
	for _, decks := range byDraft {
		with, could := countWithCard(decks, card, cubes)
		if could == 0 {
			continue
		}
		available++
		if with > 0 {
			played++
		}
	}
	return played, available
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
