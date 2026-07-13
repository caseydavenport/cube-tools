package stats

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// The pivot engine answers one question in many shapes: group decks/games by a
// dimension, measure a win-rate record, optionally over a filtered subpopulation,
// optionally split by a second dimension. Color win rates, matchups, time trends,
// and deck-composition cuts all fall out of the same aggregation - see
// design/Explore in the plan. It intentionally overlaps colors.go and
// color_matchups.go (which stay as the polished color-specific views) rather than
// replacing them.

// dnaTag is the Cube Cobra tag marking signature build-around cards.
const dnaTag = "🧬"

// PivotDimension names a way to key a deck (or its opponent). For color dims,
// Granularity picks mono/dual/trio and ColorMode picks inclusive/exact/primary.
type PivotDimension struct {
	Dim         string `json:"dim"`
	Granularity int    `json:"granularity"`
	ColorMode   string `json:"color_mode"`
}

// PivotPredicate is one filter on the deck population: does Dim's value satisfy
// Op against Value.
type PivotPredicate struct {
	Dim   string `json:"dim"`
	Op    string `json:"op"`
	Value string `json:"value"`
}

type PivotRequest struct {
	Start      string           `json:"start"`
	End        string           `json:"end"`
	GroupBy    PivotDimension   `json:"group_by"`
	SplitBy    PivotDimension   `json:"split_by"`
	BucketSize int              `json:"bucket_size"`
	Predicates []PivotPredicate `json:"predicates"`
}

// PivotCell is one group×split record. deckSet is internal bookkeeping for the
// distinct-deck count; it isn't serialized.
type PivotCell struct {
	Wins    int             `json:"wins"`
	Losses  int             `json:"losses"`
	Draws   int             `json:"draws"`
	WinPct  float64         `json:"win_pct"`
	Decks   int             `json:"decks"`
	deckSet map[string]bool `json:"-"`
}

type PivotRow struct {
	Key   string                `json:"key"`
	Label string                `json:"label"`
	Cells map[string]*PivotCell `json:"cells"`
}

type PivotResponse struct {
	GroupBy string      `json:"group_by"`
	SplitBy string      `json:"split_by"`
	Columns []string    `json:"columns"`
	Rows    []*PivotRow `json:"rows"`
}

func PivotHandler() http.Handler {
	return &pivotHandler{store: storage.NewFileDeckStoreWithCache()}
}

type pivotHandler struct {
	store storage.DeckStorage
}

func (h *pivotHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PivotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	logrus.WithField("params", req).Info("/api/stats/pivot")

	cubeID := server.CubeFromRequest(r)

	// Cube cards carry the richer oracle text and Tags, so composition dims
	// prefer them over the deck's own (possibly sparser) card copies.
	cubeCards := make(map[string]types.Card)
	if cube, err := types.LoadCube(fmt.Sprintf("data/%s/cube.json", cubeID)); err == nil {
		for _, c := range cube.Cards {
			cubeCards[c.Name] = c
		}
	}

	// Date range filters the whole population up front. Predicates then carve
	// out the subject decks, but the opponent index is built over the full
	// date-filtered set so matchup opponents always resolve even when a
	// predicate would have excluded them as a subject.
	allDecks, err := h.store.List(cubeID, &storage.DecksRequest{Start: req.Start, End: req.End})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := computePivot(allDecks, &req, cubeCards)

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write pivot response")
	}
}

func computePivot(allDecks []*storage.Deck, req *PivotRequest, cubeCards map[string]types.Card) *PivotResponse {
	idx := storage.NewOpponentIndex(allDecks)

	// A time dimension needs a stable draft->bucket label map, built over the
	// whole population so the axis doesn't shift when predicates change.
	var draftBucket map[string]string
	if req.GroupBy.Dim == "time" || req.SplitBy.Dim == "time" {
		draftBucket = buildDraftBuckets(allDecks, req.BucketSize)
	}

	groupKeyer := deckKeyer(req.GroupBy, draftBucket, cubeCards)

	// The split can be opponent-derived (per game) or deck-derived (constant per
	// deck). splitLevel tells the loop which path to take.
	splitLevel := ""
	var splitKeyer func(*storage.Deck) []string
	switch req.SplitBy.Dim {
	case "":
		// No split; only the overall column.
	case "opponent_color":
		splitLevel = "opponent"
	default:
		splitLevel = "deck"
		splitKeyer = deckKeyer(req.SplitBy, draftBucket, cubeCards)
	}

	rows := map[string]*PivotRow{}
	colsSet := map[string]bool{}

	getCell := func(rowKey, colKey string) *PivotCell {
		row, ok := rows[rowKey]
		if !ok {
			row = &PivotRow{Key: rowKey, Label: rowKey, Cells: map[string]*PivotCell{}}
			rows[rowKey] = row
		}
		cell, ok := row.Cells[colKey]
		if !ok {
			cell = &PivotCell{deckSet: map[string]bool{}}
			row.Cells[colKey] = cell
		}
		return cell
	}

	for _, d := range allDecks {
		if !deckPasses(d, req.Predicates, cubeCards) {
			continue
		}
		groupKeys := groupKeyer(d)
		if len(groupKeys) == 0 {
			continue
		}
		var deckSplitKeys []string
		if splitLevel == "deck" {
			deckSplitKeys = splitKeyer(d)
		}
		deckID := d.Metadata.DraftID + "|" + d.Player

		for _, g := range d.Games {
			outcome := gameOutcome(g, d)

			// Overall column, counted once per group key.
			for _, gk := range groupKeys {
				addOutcome(getCell(gk, ""), outcome, deckID)
			}

			if splitLevel == "" {
				continue
			}
			splitKeys := deckSplitKeys
			if splitLevel == "opponent" {
				opp, ok := idx.OpponentDeck(d, g.Opponent)
				if !ok {
					continue
				}
				splitKeys = colorGroups(opp, colorModeOf(req.SplitBy), granularityOf(req.SplitBy))
			}
			for _, sk := range splitKeys {
				colsSet[sk] = true
				for _, gk := range groupKeys {
					addOutcome(getCell(gk, sk), outcome, deckID)
				}
			}
		}
	}

	// Finalize win percentages and distinct-deck counts.
	for _, row := range rows {
		for _, cell := range row.Cells {
			cell.WinPct = winPctOf(cell.Wins, cell.Losses, cell.Draws)
			cell.Decks = len(cell.deckSet)
		}
	}

	return &PivotResponse{
		GroupBy: req.GroupBy.Dim,
		SplitBy: req.SplitBy.Dim,
		Columns: orderColumns(colsSet, req.SplitBy),
		Rows:    orderRows(rows, req.GroupBy),
	}
}

func addOutcome(c *PivotCell, outcome, deckID string) {
	switch outcome {
	case "W":
		c.Wins++
	case "L":
		c.Losses++
	default:
		c.Draws++
	}
	c.deckSet[deckID] = true
}

// gameOutcome classifies a game from deck d's perspective: "W", "L", or "D".
func gameOutcome(g types.Game, d *storage.Deck) string {
	switch {
	case g.Tie || g.Winner == "":
		return "D"
	case g.Winner == d.Player:
		return "W"
	default:
		return "L"
	}
}

func colorModeOf(dim PivotDimension) string {
	if dim.ColorMode == "" {
		return "inclusive"
	}
	return dim.ColorMode
}

func granularityOf(dim PivotDimension) int {
	if dim.Granularity < 1 || dim.Granularity > 3 {
		return 1
	}
	return dim.Granularity
}

// deckKeyer returns a function mapping a deck to zero or more keys for the given
// dimension. A deck can produce several keys (inclusive color mode, multiple
// labels); an empty result drops the deck from that dimension.
func deckKeyer(dim PivotDimension, draftBucket map[string]string, cubeCards map[string]types.Card) func(*storage.Deck) []string {
	switch dim.Dim {
	case "color":
		return func(d *storage.Deck) []string {
			return colorGroups(d, colorModeOf(dim), granularityOf(dim))
		}
	case "archetype":
		return func(d *storage.Deck) []string {
			if d.MacroArchetype == "" {
				return nil
			}
			return []string{d.MacroArchetype}
		}
	case "label":
		return func(d *storage.Deck) []string { return d.Labels }
	case "player":
		return func(d *storage.Deck) []string {
			if d.Player == "" {
				return nil
			}
			return []string{d.Player}
		}
	case "time":
		return func(d *storage.Deck) []string {
			if b, ok := draftBucket[d.Metadata.DraftID]; ok {
				return []string{b}
			}
			return nil
		}
	case "removal", "interaction", "counterspell", "creatures", "lands", "dna", "avg_cmc":
		return func(d *storage.Deck) []string {
			comp := composition(d, cubeCards)
			return []string{compBucketLabel(dim.Dim, comp.value(dim.Dim))}
		}
	}
	return func(*storage.Deck) []string { return nil }
}

// buildDraftBuckets maps each draft ID to a bucket label (the bucket's start
// date), reusing the shared discrete bucketing.
func buildDraftBuckets(allDecks []*storage.Deck, bucketSize int) map[string]string {
	if bucketSize < 1 {
		bucketSize = 1
	}
	out := map[string]string{}
	for _, b := range decks.DeckBuckets(allDecks, bucketSize, true) {
		label := b.Start()
		for _, draft := range b.Drafts {
			out[draft.Name] = label
		}
	}
	return out
}

// deckComposition holds per-deck counts over the nonland mainboard, plus the
// land count and average mana value.
type deckComposition struct {
	Removal      int
	Interaction  int
	Counterspell int
	Creatures    int
	Lands        int
	DNA          int
	AvgCMC       float64
}

func (c deckComposition) value(dim string) float64 {
	switch dim {
	case "removal":
		return float64(c.Removal)
	case "interaction":
		return float64(c.Interaction)
	case "counterspell":
		return float64(c.Counterspell)
	case "creatures":
		return float64(c.Creatures)
	case "lands":
		return float64(c.Lands)
	case "dna":
		return float64(c.DNA)
	case "avg_cmc":
		return c.AvgCMC
	}
	return 0
}

func composition(d *storage.Deck, cubeCards map[string]types.Card) deckComposition {
	comp := deckComposition{}
	cmcSum, nonland := 0, 0
	for _, card := range d.Mainboard {
		c := card
		if cc, ok := cubeCards[card.Name]; ok {
			c = cc
		}
		if c.IsLand() {
			comp.Lands++
			continue
		}
		nonland++
		cmcSum += c.CMC
		if c.IsRemoval() {
			comp.Removal++
		}
		if c.IsInteraction() {
			comp.Interaction++
		}
		if c.IsCounterspell() {
			comp.Counterspell++
		}
		if c.IsCreature() {
			comp.Creatures++
		}
		for _, t := range c.Tags {
			if t == dnaTag {
				comp.DNA++
				break
			}
		}
	}
	if nonland > 0 {
		comp.AvgCMC = float64(cmcSum) / float64(nonland)
	}
	return comp
}

// compBucketLabel buckets a numeric composition value into a range label for use
// as a group/split key.
func compBucketLabel(dim string, v float64) string {
	if dim == "avg_cmc" {
		lo := math.Floor(v*2) / 2
		return fmt.Sprintf("%.1f-%.1f", lo, lo+0.5)
	}
	n := int(v)
	switch {
	case n <= 2:
		return "0-2"
	case n <= 5:
		return "3-5"
	case n <= 8:
		return "6-8"
	default:
		return "9+"
	}
}

// deckPasses reports whether a deck satisfies every predicate (implicit AND).
func deckPasses(d *storage.Deck, preds []PivotPredicate, cubeCards map[string]types.Card) bool {
	for _, p := range preds {
		if !predicatePasses(d, p, cubeCards) {
			return false
		}
	}
	return true
}

func predicatePasses(d *storage.Deck, p PivotPredicate, cubeCards map[string]types.Card) bool {
	switch p.Dim {
	case "color":
		colors := deckColorSet(d)
		want := strings.ToUpper(p.Value)
		switch p.Op {
		case "excludes":
			for _, c := range want {
				if colors[string(c)] {
					return false
				}
			}
			return true
		default: // contains
			for _, c := range want {
				if !colors[string(c)] {
					return false
				}
			}
			return true
		}
	case "archetype":
		return compareString(d.MacroArchetype, p.Op, p.Value)
	case "player":
		return compareString(d.Player, p.Op, p.Value)
	case "label":
		has := false
		for _, l := range d.Labels {
			if strings.EqualFold(l, p.Value) {
				has = true
				break
			}
		}
		if p.Op == "neq" {
			return !has
		}
		return has
	case "card_query":
		return query.DeckMatchesBoard(d, p.Value, "mainboard")
	case "removal", "interaction", "counterspell", "creatures", "lands", "dna", "avg_cmc":
		got := composition(d, cubeCards).value(p.Dim)
		want, err := strconv.ParseFloat(p.Value, 64)
		if err != nil {
			return true // ignore an unparseable numeric predicate rather than drop everything
		}
		return compareNumber(got, p.Op, want)
	}
	return true
}

func compareString(got, op, want string) bool {
	if op == "neq" {
		return !strings.EqualFold(got, want)
	}
	return strings.EqualFold(got, want)
}

func compareNumber(got float64, op string, want float64) bool {
	switch op {
	case "lte":
		return got <= want
	case "eq":
		return got == want
	default: // gte
		return got >= want
	}
}

func deckColorSet(d *storage.Deck) map[string]bool {
	set := map[string]bool{}
	for _, c := range d.GetColors() {
		set[c] = true
	}
	return set
}

// orderColumns returns the column keys in display order, with the overall ("")
// column always first.
func orderColumns(colsSet map[string]bool, dim PivotDimension) []string {
	keys := make([]string, 0, len(colsSet))
	for k := range colsSet {
		keys = append(keys, k)
	}
	sortKeys(keys, dim.Dim)
	return append([]string{""}, keys...)
}

// orderRows sorts rows by the dimension's natural order (color WUBRG, time/comp
// ascending) and by overall win% descending for unordered dims (archetype,
// player, label).
func orderRows(rows map[string]*PivotRow, dim PivotDimension) []*PivotRow {
	out := make([]*PivotRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, r)
	}
	switch dim.Dim {
	case "color", "time", "removal", "interaction", "counterspell", "creatures", "lands", "dna", "avg_cmc":
		keys := make([]string, len(out))
		for i, r := range out {
			keys[i] = r.Key
		}
		rank := keyRanks(keys, dim.Dim)
		sort.SliceStable(out, func(i, j int) bool { return rank[out[i].Key] < rank[out[j].Key] })
	default:
		sort.SliceStable(out, func(i, j int) bool {
			return overallWinPct(out[i]) > overallWinPct(out[j])
		})
	}
	return out
}

func overallWinPct(r *PivotRow) float64 {
	if c, ok := r.Cells[""]; ok {
		return c.WinPct
	}
	return 0
}

// sortKeys orders keys in place by the dimension's natural order.
func sortKeys(keys []string, dim string) {
	rank := keyRanks(keys, dim)
	sort.SliceStable(keys, func(i, j int) bool { return rank[keys[i]] < rank[keys[j]] })
}

// keyRanks assigns each key a sortable rank based on the dimension: color keys
// by WUBRG position, composition/time by their leading number, everything else
// alphabetically.
func keyRanks(keys []string, dim string) map[string]float64 {
	rank := map[string]float64{}
	switch dim {
	case "color", "opponent_color":
		for _, k := range keys {
			rank[k] = colorRank(k)
		}
	case "removal", "interaction", "counterspell", "creatures", "lands", "dna", "avg_cmc":
		for _, k := range keys {
			rank[k] = leadingNumber(k)
		}
	default: // time (dates sort lexically) and any alpha dim
		sorted := append([]string{}, keys...)
		sort.Strings(sorted)
		for i, k := range sorted {
			rank[k] = float64(i)
		}
	}
	return rank
}

// colorRank turns a color key like "WU" into a sortable number: shorter
// identities first, then WUBRG order within a length.
func colorRank(key string) float64 {
	r := float64(len(key)) * 100000
	for _, c := range key {
		r = r*10 + float64(strings.IndexRune("WUBRG", c)+1)
	}
	return r
}

func leadingNumber(key string) float64 {
	end := 0
	for end < len(key) && (key[end] == '.' || (key[end] >= '0' && key[end] <= '9')) {
		end++
	}
	if end == 0 {
		return math.MaxFloat64 // "9+" and other non-numeric-leading go last
	}
	n, err := strconv.ParseFloat(key[:end], 64)
	if err != nil {
		return math.MaxFloat64
	}
	return n
}
