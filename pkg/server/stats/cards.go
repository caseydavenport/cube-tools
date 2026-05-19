package stats

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"slices"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type CardStatsRequest struct {
	// Embed deck request to allow filtering by player, date range, and draft size.
	*storage.DecksRequest

	// Configuration for bucketed responses.
	BucketSize int  `json:"bucket_size"`
	Sliding    bool `json:"sliding"`

	// Color to filter by - WUBRG.
	Color string `json:"color"`
	// Minimum nubmer of drafts a card must have been in to be included.
	MinDrafts int `json:"min_drafts"`
	// Minimum number of games a card must have been in to be included.
	MinGames int `json:"min_games"`
}

type CardStatsResponse struct {
	// Aggregated stats for each card across all decks matching the request.
	All *Cards `json:"all"`

	// If bucketed response, then bucketed response data corresponding to the request.
	Buckets []*Bucket `json:"buckets,omitempty"`
}

type Bucket struct {
	// Inline the cards data.
	Cards `json:",inline"`

	// Include metadata about the bucket.
	Name string `json:"name"`

	// Total number of games in this bucket.
	Games int `json:"games,omitempty"`
}

func parseCardsRequest(r *http.Request) *CardStatsRequest {
	// Pull deck params from the request.
	p := CardStatsRequest{}
	p.Color = query.GetString(r, "color")
	p.BucketSize = query.GetInt(r, "bucket_size")
	p.Sliding = query.GetBool(r, "sliding")
	p.MinDrafts = query.GetInt(r, "min_drafts")
	p.MinGames = query.GetInt(r, "min_games")

	// Parse the embedded deck request.
	p.DecksRequest = decks.ParseDecksRequest(r)
	return &p
}

func CardStatsHandler() http.Handler {
	return &cardStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type cardStatsHandler struct {
	store storage.DeckStorage
}

func (d *cardStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseCardsRequest(r)
	logrus.WithField("params", sr).Info("/api/stats/cards")

	resp := CardStatsResponse{}

	// Build a map of all the cards in the cube, so we can use it to skip any cards
	// not curerently in the cube.
	cubeID := server.CubeFromRequest(r)
	cubeCards := make(map[string]types.Card)
	cube, err := types.LoadCube(fmt.Sprintf("data/%s/cube.json", cubeID))
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}
	for _, c := range cube.Cards {
		cubeCards[c.Name] = c
	}

	// Load allDecks matching the request.
	allDecks, err := d.store.List(cubeID, sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Initlialize the response structure.
	resp = CardStatsResponse{}
	if sr.BucketSize > 0 {
		// If bucket size is set, then create bucketed response.
		buckets := decks.DeckBuckets(allDecks, sr.BucketSize, !sr.Sliding)
		for _, b := range buckets {
			s := d.statsForDecks(b.AllDecks(), cubeCards, sr)
			resp.Buckets = append(resp.Buckets, &Bucket{
				Cards: *s,
				Name:  b.Name(),
				Games: b.TotalGames(),
			})
		}
	} else {
		resp.All = d.statsForDecks(allDecks, cubeCards, sr)
	}

	// Marshal the response and write it back.
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	_, err = rw.Write(b)
	if err != nil {
		logrus.WithError(err).Error("could not write response")
		return
	}
}

func (d *cardStatsHandler) statsForDecks(decks []*storage.Deck, cubeCards map[string]types.Card, sr *CardStatsRequest) *Cards {
	resp := &Cards{
		Data: make(map[string]*cardStats),
	}

	// Sum up the total number of wins across all decks - we'll use this to calculate
	// PercentOfWins for each card later.
	var totalWins int

	// Track the drafts that this card has been seen in.
	draftsByCard := make(map[string]map[string]bool)
	seeCardInDraft := func(cardName, draftID string) {
		if _, ok := draftsByCard[cardName]; !ok {
			draftsByCard[cardName] = make(map[string]bool)
		}
		draftsByCard[cardName][draftID] = true
	}

	// Go through each deck, adding stats for each card in the deck.
	for _, deck := range decks {
		// Increment the total wins counter.
		totalWins += deck.GameWins()

		// Get the set of unique cards in this deck's mainboard.
		mbSet, sbSet, poolSet := cardSetFromDeck(deck.Deck, cubeCards, sr.Color)

		for _, card := range mbSet {
			// Initalize a new cardStats if we haven't seen this card before.
			if _, ok := resp.Data[card.Name]; !ok {
				cp := *card
				resp.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Data[card.Name]

			// Increment basic stats for this card based on the deck.
			cbn.Mainboard++
			cbn.Wins += deck.GameWins()
			cbn.Losses += deck.GameLosses()
			cbn.Draws += deck.GameDraws()
			cbn.Trophies += deck.Trophies()
			cbn.LastPlace += deck.LastPlace()
			cbn.TopHalf += deck.TopHalf()
			cbn.BottomHalf += deck.BottomHalf()

			// Add contribution to archetype-specific stats.
			arch := deck.Macro()
			if arch != "" {
				if cbn.ByArchetype[arch] == nil {
					cbn.ByArchetype[arch] = &winStats{}
				}
				cbn.ByArchetype[arch].Add(deck)
			}

			// For each deck that this card was in, go through each opponent deck and add to the AgainstArchetype stats.
			for _, game := range deck.Games {
				arch := server.LookupOpponentMacro(decks, deck, game.Opponent)
				if arch == "" {
					continue // No opponent deck found.
				}
				if cbn.AgainstArchetype[arch] == nil {
					cbn.AgainstArchetype[arch] = &winStats{}
				}
				ws := cbn.AgainstArchetype[arch]
				switch {
				case game.Tie || game.Winner == "":
					ws.Draws++
				case game.Winner == deck.Player:
					ws.Wins++
				default:
					ws.Losses++
				}
			}

			// Update the last date that this card was put in a mainboard.
			deckDate, err := time.Parse("2006-01-02", deck.Date)
			if err != nil {
				logrus.WithError(err).WithField("date", deck.Date).Warn("could not parse deck date")
				continue
			}
			if cbn.LastMainboarded == "" {
				// First time seeing this card, so set last mainboarded to the deck date.
				cbn.LastMainboarded = deck.Date
			}
			lastDate, err := time.Parse("2006-01-02", cbn.LastMainboarded)
			if err != nil {
				logrus.WithError(err).WithField("date", cbn.LastMainboarded).Warn("could not parse last mainboarded date")
				continue
			}
			if deckDate.After(lastDate) {
				cbn.LastMainboarded = deck.Date
			}

			// Increment player count.
			cbn.Players[deck.Player]++

			// Include archetype data for this card
			for _, l := range deck.Labels {
				cbn.Archetypes[l]++
			}

			// Track drafts for this card.
			seeCardInDraft(card.Name, deck.Metadata.DraftID)
		}

		for _, card := range sbSet {
			// Initalize a new cardStats if we haven't seen this card before.
			if _, ok := resp.Data[card.Name]; !ok {
				cp := *card
				resp.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Data[card.Name]

			// Increment basic stats for this card.
			cbn.Sideboard++

			// If the card is in the deck color(s), increment PlayableSideboard.
			if deck.CanCast(cubeCards[card.Name]) {
				cbn.PlayableSideboard++
			}

			// Increment player count.
			cbn.Sideboarders[deck.Player]++

			// Track drafts for this card.
			seeCardInDraft(card.Name, deck.Metadata.DraftID)
		}

		for _, card := range poolSet {
			// Initalize a new cardStats if we haven't seen this card before.
			if _, ok := resp.Data[card.Name]; !ok {
				cp := *card
				resp.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Data[card.Name]
			cbn.Pool++

			// Track drafts for this card.
			seeCardInDraft(card.Name, deck.Metadata.DraftID)
		}
	}

	// Get ELO data to include in the response.
	eloData := ELOData(decks)

	// Now that we've gone through all the decks, calculate win percentages and mainboard/sideboard percentages,
	// and perform any filtering based on the request parameters.
	for _, card := range resp.Data {
		// Add ELO data.
		if elo, ok := eloData[card.Name]; ok {
			card.ELO = elo
		} else {
			card.ELO = 1200
		}

		card.ExpectedWinPercent = ExpectedWinPercent(card.Name, card.Players, decks)

		// Calculate win percentage and mainboard/sideboard percentages.
		card.TotalGames = card.Wins + card.Losses + card.Draws
		card.WinPercent = winPctOf(card.Wins, card.Losses, card.Draws)
		card.PercentOfWins = pct(float64(card.Wins), float64(totalWins))

		decksWithCard := card.Mainboard + card.Sideboard
		card.MainboardPercent = pct(float64(card.Mainboard), float64(decksWithCard))
		card.SideboardPercent = pct(float64(card.Sideboard), float64(decksWithCard))

		// Calculate per-archetype win percentages. Only show archetype-specific
		// win percentages with at least 15 games played; smaller samples are
		// noisy and misleading.
		for _, ws := range card.ByArchetype {
			if ws.Wins+ws.Losses+ws.Draws > 15 {
				ws.Finalize()
			}
		}
		for _, ws := range card.AgainstArchetype {
			if ws.Wins+ws.Losses+ws.Draws > 15 {
				ws.Finalize()
			}
		}

		// Calculate total drafts.
		if drafts, ok := draftsByCard[card.Name]; ok {
			card.Drafts = len(drafts)
		}

		// Apply filtering based on the request parameters.
		if shouldFilterCard(card, sr) {
			delete(resp.Data, card.Name)
		}
	}

	return resp
}

func ExpectedWinPercent(cardName string, players map[string]int, decks []*storage.Deck) float64 {
	r := Record{}
	for _, d := range decks {
		// Skip decks that were not played by one of the specified players.
		if _, ok := players[d.Player]; !ok {
			continue
		}

		// This deck was played by one of the specified players. Skip this deck if it
		// includes the specified card.
		found := false
		for _, c := range d.Mainboard {
			if c.Name == cardName {
				found = true
				break
			}
		}
		if found {
			continue
		}

		// This deck does not include the card, so include its results.
		r.Add(d)
	}
	r.Finalize()
	return r.WinPercent
}

// K-factor for ELO updates.
const eloK = 4.0

// colorsCompete reports whether two cards' color identities suggest they
// compete for the same slot. Colorless cards fit any deck, so they compete
// with anything. Otherwise, the cards compete iff their colors overlap.
//
// Note: this is only called for (mb, sb) pairs that survive buildELOPairs's
// CanCast filter, so both cards are already known to be castable in the
// same deck. That lets us treat "shares a color" as genuine competition -
// e.g., W vs WU only reaches here inside a WU deck. A W card in a WG deck
// being compared against a WU sideboard card can't happen, because the WU
// card would be filtered out by CanCast.
func colorsCompete(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return true
	}
	for _, c := range a {
		if slices.Contains(b, c) {
			return true
		}
	}
	return false
}

// How much the mainboard card "wins" against the sideboard card. The closer
// the two cards are in CMC, color, and type, the more directly they compete,
// so the mainboard card gets more credit for being chosen.
func eloWinValue(mb, sb types.Card) float64 {
	winValue := 1.0
	if mb.CMC != sb.CMC {
		winValue -= 0.025 * math.Abs(float64(mb.CMC-sb.CMC))
	}

	if !colorsCompete(mb.Colors, sb.Colors) {
		winValue -= 0.05
	}

	if mb.IsCreature() != sb.IsCreature() {
		winValue -= 0.1
	}

	if winValue < 0.55 {
		winValue = 0.55
	}
	return winValue
}

// A mainboard-vs-sideboard matchup. mbIdx and sbIdx are positions into the
// cards-by-index slice built in ELOData (so we can avoid map lookups in the
// hot loop). count is the number of decks in which this pair appears -
// since winValue depends only on the two cards, identical pairs across
// decks collapse to a single entry with a count.
type eloPair struct {
	mbIdx, sbIdx int
	count        float64
	winValue     float64
}

// buildELOPairs walks every deck and produces the deduplicated list of
// (mainboard card, sideboard card) pairs that contribute to ELO. The idx
// map translates card names to their integer position in the rating slice,
// so the returned pairs are ready for use in the index-based inner loop.
func buildELOPairs(decks []*storage.Deck, idx map[string]int) []eloPair {
	// Accumulate counts and winValues by (mbIdx, sbIdx) so duplicate pairs
	// across decks collapse together. We split count and winValue into two
	// maps so we only have to call eloWinValue the first time we see a pair.
	type key struct{ mbIdx, sbIdx int32 }
	counts := make(map[key]int)
	values := make(map[key]float64)

	// Reusable scratch space for the eligible sideboard of the current deck.
	// Looking up idx[card.Name] and CanCast once per sideboard card (instead
	// of once per mainboard-sideboard pair) is a big speedup.
	type sbEntry struct {
		idx  int32
		card types.Card
	}
	var eligibleSB []sbEntry

	for _, deck := range decks {
		eligibleSB = eligibleSB[:0]
		for _, sb := range deck.Sideboard {
			if sb.IsBasicLand() || !deck.CanCast(sb) {
				continue
			}
			eligibleSB = append(eligibleSB, sbEntry{int32(idx[sb.Name]), sb})
		}
		if len(eligibleSB) == 0 {
			continue
		}
		for _, mb := range deck.Mainboard {
			if mb.IsBasicLand() {
				continue
			}
			mbIdx := int32(idx[mb.Name])
			for _, sb := range eligibleSB {
				k := key{mbIdx, sb.idx}
				if _, ok := counts[k]; !ok {
					values[k] = eloWinValue(mb, sb.card)
				}
				counts[k]++
			}
		}
	}

	pairs := make([]eloPair, 0, len(counts))
	for k, n := range counts {
		pairs = append(pairs, eloPair{
			mbIdx:    int(k.mbIdx),
			sbIdx:    int(k.sbIdx),
			count:    float64(n),
			winValue: values[k],
		})
	}
	return pairs
}

// Compute one pass of ELO updates against the given snapshot of ratings.
// Diffs are written but not applied, so all pairs see the same starting
// state and the result doesn't depend on iteration order. The ratings and
// diffs slices are caller-owned scratch space indexed by the same card
// index used in eloPair, so this whole inner loop is map-free.
func runELOPass(pairs []eloPair, snapshot, ratings, diffs []float64) {
	// Precompute 10^(elo/400) per card once per pass instead of twice per
	// pair, since snapshot is fixed for the duration of the pass.
	for i, elo := range snapshot {
		ratings[i] = math.Pow(10, elo/400)
	}
	for i := range diffs {
		diffs[i] = 0
	}
	for _, p := range pairs {
		mbRating, sbRating := ratings[p.mbIdx], ratings[p.sbIdx]
		expectedMbWin := mbRating / (mbRating + sbRating)
		d := p.count * eloK * (p.winValue - expectedMbWin)
		diffs[p.mbIdx] += d
		diffs[p.sbIdx] -= d
	}
}

func ELOData(decks []*storage.Deck) map[string]int {
	// Assign each unique card an integer index. Throughout the rest of the
	// calculation, cards are referred to by this index instead of by name,
	// so we can keep ratings / diffs / etc. in plain []float64 slices keyed
	// by index. Surprisingly, we have enough data here that the difference
	// between a slice index lookup and a map lookup actually matters! The
	// names slice maps the index back to a card name when we build the
	// result.
	idx := make(map[string]int)
	var names []string
	addCard := func(name string) {
		if _, ok := idx[name]; !ok {
			idx[name] = len(names)
			names = append(names, name)
		}
	}
	for _, d := range decks {
		for _, card := range d.Mainboard {
			addCard(card.Name)
		}
		for _, card := range d.Sideboard {
			addCard(card.Name)
		}
	}

	// All cards start at 1200. elos[i] holds the current rating of names[i].
	elos := make([]float64, len(names))
	for i := range elos {
		elos[i] = 1200
	}

	pairs := buildELOPairs(decks, idx)

	// Iterate until ratings stop moving. Each pass updates against a snapshot
	// of the previous iteration's ratings so the result is independent of
	// deck order. Output is rounded to int, so a 0.5 swing is invisible.
	const maxIterations = 50
	const convergenceThreshold = 0.5
	snapshot := make([]float64, len(elos))
	ratings := make([]float64, len(elos))
	diffs := make([]float64, len(elos))
	for iter := 0; iter < maxIterations; iter++ {
		copy(snapshot, elos)
		runELOPass(pairs, snapshot, ratings, diffs)
		maxDelta := 0.0
		for i, d := range diffs {
			elos[i] += d
			if a := math.Abs(d); a > maxDelta {
				maxDelta = a
			}
		}
		if maxDelta < convergenceThreshold {
			break
		}
	}

	// Translate the indexed rating slice back to a name-keyed map for the
	// caller.
	result := make(map[string]int, len(names))
	for i, name := range names {
		result[name] = int(elos[i])
	}
	return result
}

func shouldFilterCard(cbn *cardStats, sr *CardStatsRequest) bool {
	// For bucketed requests, we don't filter. The filteres in the request only apply to non-bucketed
	// aggregate requests.
	if sr.BucketSize > 0 {
		return false
	}

	// Filter based on min drafts and min games.
	if sr.MinDrafts > 0 && cbn.Drafts < sr.MinDrafts {
		return true
	}
	if sr.MinGames > 0 && cbn.Wins+cbn.Losses < sr.MinGames {
		return true
	}
	return false
}

// Most cards are singleton in my cube. Except for fetches / shocks, for which it is
// very possible there are multiple in the same deck. Create a "set" of all the unique
// cards in the deck - this prevents double counting the wins contributed from a deck when there are
// two of a card in that deck. This is imperfect - there is some value in knowing that a deck with two Arid Mesas
// performed well - but I think without this deduplication we would overstate the importance of Arid Mesa in that deck
// more than we understate it now.
func cardSetFromDeck(deck types.Deck, cubeCards map[string]types.Card, color string) (map[string]*cardStats, map[string]*cardStats, map[string]*cardStats) {
	mbSet := make(map[string]*cardStats)
	sbSet := make(map[string]*cardStats)
	poolSet := make(map[string]*cardStats)

	for _, card := range deck.Mainboard {
		// Skip the card if it's not currently in the cube, or if it's a basic land.
		cubeCard, ok := cubeCards[card.Name]
		if !ok {
			continue
		}
		if card.IsBasicLand() {
			continue
		}
		if !card.MatchesColor(color) {
			continue
		}

		// Use the cube card for stats, since it has enriched data (e.g., oracle text
		// for multi-face cards).
		mbSet[card.Name] = newCardStats(cubeCard)
	}

	for _, card := range deck.Sideboard {
		// Skip the card if it's not currently in the cube, or if it's a basic land.
		cubeCard, ok := cubeCards[card.Name]
		if !ok {
			continue
		}
		if card.IsBasicLand() {
			continue
		}
		if !card.MatchesColor(color) {
			continue
		}
		// Use the cube card for stats, since it has enriched data (e.g., oracle text
		// for multi-face cards).
		sbSet[card.Name] = newCardStats(cubeCard)
	}

	// As an approximation - for card pools that do not have a mainbard/sideboard split, but do have a color identity specified,
	// assume that any card NOT in that identity is sideboarded. We don't do the same for the mainboard, because castable cards could go in
	// either the mainboard or sideboard. This is imperfect, but should be directionally correct most of the time.
	for _, card := range deck.Pool {
		// Skip the card if it's not currently in the cube, or if it's a basic land.
		cubeCard, ok := cubeCards[card.Name]
		if !ok {
			continue
		}
		if card.IsBasicLand() {
			continue
		}
		if !card.MatchesColor(color) {
			continue
		}

		if len(deck.GetColors()) > 0 && !deck.CanCast(card) {
			sbSet[card.Name] = newCardStats(cubeCard)
		} else {
			poolSet[card.Name] = newCardStats(cubeCard)
		}
	}

	return mbSet, sbSet, poolSet
}

type Cards struct {
	Data map[string]*cardStats `json:"data"`
}

func newCardStats(c types.Card) *cardStats {
	return &cardStats{
		Card:         c,
		Archetypes:   make(map[string]int),
		Players:      make(map[string]int),
		Sideboarders: make(map[string]int),
		Land:         c.IsLand(),
		Interaction:  c.IsInteraction(),
		Counterspell: c.IsCounterspell(),
		Removal:      c.IsRemoval(),
		WordCount:    c.WordCount(),
		ByArchetype: map[string]*winStats{
			"aggro":    {},
			"midrange": {},
			"control":  {},
			"tempo":    {},
		},
		AgainstArchetype: map[string]*winStats{
			"aggro":    {},
			"midrange": {},
			"control":  {},
			"tempo":    {},
		},
	}
}

// cardStats holds statistics about a specific card.
type cardStats struct {
	// Embed a types.Card so we inherit its fields for consistency.
	types.Card `json:",inline"`

	///////////////////////////////////////////////
	// Augment the base Card with computed statistics.
	///////////////////////////////////////////////

	// Number of times this card has been mainboarded
	Mainboard int `json:"mainboard"`

	// Number of times this card has been sideboarded
	Sideboard int `json:"sideboard"`

	// Number of times this card has been in the draft pool but not in mainboard or sideboard
	Pool int `json:"pool,omitempty"`

	// Total number of drafts this card has been in.
	Drafts int `json:"drafts,omitempty"`

	// Total number of games this card has been in.
	TotalGames int `json:"total_games"`

	// Number of times this card was in deck color(s), and sideboarded
	PlayableSideboard int `json:"playable_sideboard"`

	// Number of wins (does not include sideboard)
	Wins int `json:"wins"`

	// Number of losses (does not include sideboard)
	Losses int `json:"losses"`

	// Number of game draws (does not include sideboard)
	Draws int `json:"draws"`

	// Number of 3-0 decks this card has been in
	Trophies int `json:"trophies"`

	// Numer of 2-1 (or better) and 1-2 (or worse) finishes for this card.
	TopHalf    int `json:"top_half"`
	BottomHalf int `json:"bottom_half"`

	// Number of 0-3 decks this card has been in
	LastPlace int `json:"last_place"`

	// Win percentage
	WinPercent float64 `json:"win_percent"`

	// Expected win percentage is the win percentage of players who have mainboarded this card,
	// excluding decks that included this card.
	ExpectedWinPercent float64 `json:"expected_win_percent"`

	// Percent of all games won by decks with this card. This is different from WinPercent, which is
	// the percentage of games won given that this card was in the mainboard.
	PercentOfWins float64 `json:"percent_of_wins"`

	// Mainboard percentage
	MainboardPercent float64 `json:"mainboard_percent"`

	// Sideboard percentage
	SideboardPercent float64 `json:"sideboard_percent"`

	// Map of archetype to times played in that archetype
	Archetypes map[string]int `json:"archetypes"`

	// Who has played this card, and how often
	Players map[string]int `json:"players"`

	// Who has sideboarded this card, and how often
	Sideboarders map[string]int `json:"sideboarders"`

	// The last date that this card was mainboarded
	LastMainboarded string `json:"last_mainboarded"`

	// Whether or not this card is classified as "interaction"
	Interaction bool `json:"interaction"`

	// Whether or not this is a counterspell
	Counterspell bool `json:"counterspell"`

	// Whether or not this is removal
	Removal bool `json:"removal"`

	// Whether or not this is a land
	Land bool `json:"land"`

	// Number of words in the card's oracle text, excluding reminder text.
	WordCount int `json:"word_count"`

	// ELO.
	ELO int `json:"elo"`

	// Track how this card as fared within various archetypes. i.e., win percentages given
	// that the card was played in a specific archetype.
	ByArchetype map[string]*winStats `json:"by_archetype,omitempty"`

	// Track how this card has fared against various archetypes. i.e., win percentages given
	// that the card was played against a specific archetype.
	AgainstArchetype map[string]*winStats `json:"against_archetype,omitempty"`
}

type winStats struct {
	Record
}
