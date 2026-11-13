package stats

import (
	"fmt"
	"math"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// The removal page scores each spot-removal card by how much of the cube's creature base it can kill and how cheaply. Cost modeling uses delve and X heuristics plus a curated override table.

// representativeX is the value we assume for X-cost removal ("average" case).
const representativeX = 3

// RemovalProfile is the parsed kill condition of a spot-removal spell. A zero
// value on a Max* axis means that axis is unconstrained.
type RemovalProfile struct {
	// Spot is true for single-target battlefield removal, the only kind the page scores.
	Spot bool

	// Kind is "destroy", "exile", "damage", "shrink" or "fight" for spot removal.
	// Other removal keeps "sweeper", "edict", "tempo" or "unclassified".
	Kind string

	// Restriction is a human label such as "toughness ≤ 3" or "any creature".
	Restriction  string
	MaxToughness int
	MaxPower     int
	MaxMV        int
	MaxPTSum     int
	ColorExclude string
	ColorOnly    string
	FlyingOnly   bool
	Scalable     bool
}

// removalMode is one cost/target mode of a multi-mode removal spell (kicker,
// revolt, etc.). Each mode becomes its own row.
type removalMode struct {
	label   string
	cost    int
	profile RemovalProfile
}

// removalOverride hand-corrects cards our heuristics get wrong: cost overrides
// the effective mana cost (activated abilities, reduced costs); profile, when
// set, replaces the parsed kill condition; modes, when set, splits the card into
// several rows (one per cost/target mode).
type removalOverride struct {
	cost    int
	profile *RemovalProfile
	modes   []removalMode
}

// removalOverrides are the curated corrections, keyed by card name.
var removalOverrides = map[string]removalOverride{
	// Reduced / alternate cast costs.
	// Leyline Binding's domain makes it about {1}-{2} in a 5-color cube.
	"Leyline Binding": {cost: 2},
	// Ride's End costs {3} less targeting a tapped permanent.
	"Ride's End": {cost: 2},
	// Fireblast's alternate cost sacrifices two Mountains, scored as two lands' worth.
	"Fireblast": {cost: 2},
	// Harvester of Misery is scored on its discard trigger; cast, it shrinks every other creature.
	"Harvester of Misery": {cost: 2},

	// Not spot removal: an empty profile leaves Spot false, so the page counts
	// it as excluded. Mayhem Devil only pings when permanents are sacrificed.
	"Mayhem Devil": {profile: &RemovalProfile{}},

	// The removal is the adventure/back face (Locthwain Scorn, {1}{B}), not the
	// {5}{B}{B} front face the printed mana value reflects.
	"Virtue of Persistence // Locthwain Scorn": {cost: 2},

	// Activated / channel removal on permanents & lands: cost is the ability, not
	// the card's mana value.
	"Barbarian Ring":              {cost: 1},
	"Eiganjo, Seat of the Empire": {cost: 3},
	"Seal of Fire":                {cost: 1},
	"Pyrite Spellbomb":            {cost: 2},
	"Grim Lavamancer":             {cost: 2},
	"Twinshot Sniper":             {cost: 2},

	// Effects our regexes misread.
	"Prismatic Ending": {
		cost: representativeX + 1,
		profile: &RemovalProfile{
			Spot:        true,
			Kind:        "exile",
			MaxMV:       representativeX,
			Restriction: fmt.Sprintf("MV ≤ %d (X≈%d)", representativeX, representativeX),
		},
	},
	"Chainweb Aracnir": {cost: 1, profile: &RemovalProfile{Spot: true, Kind: "damage", MaxToughness: 1, FlyingOnly: true, Restriction: "toughness ≤ 1, fliers"}},

	// Multi-mode: a cheap restricted mode and a pricier/looser mode, as separate rows.
	"Bloodchief's Thirst": {modes: []removalMode{
		{label: "base", cost: 1, profile: RemovalProfile{Spot: true, Kind: "destroy", MaxMV: 2, Restriction: "MV ≤ 2"}},
		{label: "kicked", cost: 4, profile: RemovalProfile{Spot: true, Kind: "destroy", Restriction: "any creature"}},
	}},
	"Fatal Push": {modes: []removalMode{
		{label: "base", cost: 1, profile: RemovalProfile{Spot: true, Kind: "destroy", MaxMV: 2, Restriction: "MV ≤ 2"}},
		{label: "revolt", cost: 1, profile: RemovalProfile{Spot: true, Kind: "destroy", MaxMV: 4, Restriction: "MV ≤ 4 (revolt)"}},
	}},
}

var (
	reSweeper   = regexp.MustCompile(`all creatures get|destroy all|exile all|each player sacrifices|damage to each creature`)
	reEdict     = regexp.MustCompile(`(?:each|target) (?:player|opponent) sacrifices|sacrifices a creature`)
	reTempo     = regexp.MustCompile(`return target creature to its owner's hand|tap target creature|stun counter`)
	reDamage    = regexp.MustCompile(`deals (\d+|x) damage to (?:any target|target (?:attacking |blocking |attacking or blocking )?creature|target creature or planeswalker)`)
	reMinus     = regexp.MustCompile(`gets -(\d+|x)/-(\d+|x)`)
	rePTSum     = regexp.MustCompile(`total power and toughness (\d+) or less`)
	rePower     = regexp.MustCompile(`power (\d+) or less`)
	reToughness = regexp.MustCompile(`toughness (\d+) or less`)
	reMV        = regexp.MustCompile(`mana value (\d+) or less`)
	reDestroy   = regexp.MustCompile(`(?:destroy|exile) target (?:creature|nonland permanent|permanent|creature or planeswalker|creature or vehicle)`)
	reFight     = regexp.MustCompile(`fights target creature|damage equal to`)
	reColorOnly = regexp.MustCompile(`target (white|blue|black|red|green) (?:creature|permanent)`)
	reNonColor  = regexp.MustCompile(`non(white|blue|black|red|green) (?:creature|permanent)`)
	reGeneric   = regexp.MustCompile(`\{(\d+)\}`)
	reExileVerb = regexp.MustCompile(`exile target`)
	reHasFlying = regexp.MustCompile(`(?:^|\W)flying(?:\W|$)`)

	// reUntargetable finds hexproof or shroud on a keyword line ("Flying,
	// shroud"), so it skips conditional grants and "hexproof from blue".
	reUntargetable = regexp.MustCompile(`(?im)^(?:[a-z ]+, )*(?:hexproof|shroud)(?:,| \(|$)`)
)

// removalQualifier is a rules-text cap on what a removal spell can target, such
// as "mana value 3 or less". The regexp captures the number, format builds the
// restriction label, and apply sets the matching Max* field. Kickable
// qualifiers note a kicker in the label.
type removalQualifier struct {
	re       *regexp.Regexp
	format   string
	kickable bool
	apply    func(p *RemovalProfile, n int)
}

// removalQualifiers are checked in order, so the first cap in the text wins.
var removalQualifiers = []removalQualifier{
	{re: rePTSum, format: "P+T ≤ %d", apply: func(p *RemovalProfile, n int) { p.MaxPTSum = n }},
	{re: reMV, format: "MV ≤ %d", kickable: true, apply: func(p *RemovalProfile, n int) { p.MaxMV = n }},
	{re: rePower, format: "power ≤ %d", apply: func(p *RemovalProfile, n int) { p.MaxPower = n }},
	{re: reToughness, format: "toughness ≤ %d", apply: func(p *RemovalProfile, n int) { p.MaxToughness = n }},
}

// colorLetter maps a color word in rules text to its mana symbol.
var colorLetter = map[string]string{
	"white": "W",
	"blue":  "U",
	"black": "B",
	"red":   "R",
	"green": "G",
}

// classifyRemoval parses a card into its spot-removal profile. Cards that aren't
// removal come back as the zero profile. Sweepers, edicts and tempo effects keep
// their Kind, and removal the regexes can't read is "unclassified"; all have Spot false.
func classifyRemoval(c types.Card) RemovalProfile {
	if o, ok := removalOverrides[c.Name]; ok && o.profile != nil {
		return *o.profile
	}
	if !c.IsRemoval() {
		return RemovalProfile{}
	}
	text := strings.ToLower(reminderTextStripped(c.OracleText))

	if reSweeper.MatchString(text) {
		return RemovalProfile{Kind: "sweeper"}
	}
	if reEdict.MatchString(text) {
		return RemovalProfile{Kind: "edict"}
	}
	if reTempo.MatchString(text) && !reDestroy.MatchString(text) && !reDamage.MatchString(text) {
		return RemovalProfile{Kind: "tempo"}
	}

	verb := "destroy"
	if reExileVerb.MatchString(text) {
		verb = "exile"
	}
	applyColor := func(p *RemovalProfile) {
		if m := reNonColor.FindStringSubmatch(text); m != nil {
			p.ColorExclude = colorLetter[m[1]]
			p.Restriction += fmt.Sprintf(", non%s", m[1])
		}
		if m := reColorOnly.FindStringSubmatch(text); m != nil {
			p.ColorOnly = colorLetter[m[1]]
			p.Restriction += fmt.Sprintf(", %s only", m[1])
		}
	}
	kicked := ""
	if strings.Contains(text, "kicked") || strings.Contains(text, "kicker") {
		kicked = " (kicker: any)"
	}

	// A cap on power, toughness, mana value or total P+T comes before plain destroy.
	for _, q := range removalQualifiers {
		m := q.re.FindStringSubmatch(text)
		if m == nil {
			continue
		}
		n := parseCapturedInt(m[1])
		p := RemovalProfile{Spot: true, Kind: verb, Restriction: fmt.Sprintf(q.format, n)}
		q.apply(&p, n)
		if q.kickable {
			p.Restriction += kicked
		}
		applyColor(&p)
		return p
	}

	// Damage and -X/-X shrink both cap by toughness. A literal X is scalable and grouped separately; a bounded X like Prismatic Ending gets a curated profile.
	if m := reDamage.FindStringSubmatch(text); m != nil {
		if m[1] == "x" {
			return RemovalProfile{Spot: true, Kind: "damage", Scalable: true, Restriction: "scalable (X damage)"}
		}
		n := parseCapturedInt(m[1])
		return RemovalProfile{Spot: true, Kind: "damage", MaxToughness: n, Restriction: fmt.Sprintf("toughness ≤ %d", n)}
	}
	if m := reMinus.FindStringSubmatch(text); m != nil {
		if m[2] == "x" {
			return RemovalProfile{Spot: true, Kind: "shrink", Scalable: true, Restriction: "scalable (-X/-X)"}
		}
		n := parseCapturedInt(m[2])
		return RemovalProfile{Spot: true, Kind: "shrink", MaxToughness: n, Restriction: fmt.Sprintf("toughness ≤ %d", n)}
	}

	// Fights / "damage equal to" scale with a creature's power.
	if reFight.MatchString(text) {
		return RemovalProfile{Spot: true, Kind: "fight", Scalable: true, Restriction: "scalable (fight)"}
	}

	// Plain destroy/exile with no qualifier hits anything - unless it targets a
	// card in a graveyard (graveyard hate, not battlefield removal, e.g. Deathrite
	// Shaman's "exile target creature card from a graveyard").
	if loc := reDestroy.FindStringIndex(text); loc != nil {
		after := text[loc[1]:min(loc[1]+10, len(text))]
		if !strings.Contains(after, "card") {
			p := RemovalProfile{Spot: true, Kind: verb, Restriction: "any creature"}
			if strings.Contains(text, "delve") {
				p.Restriction = "any creature (delve)"
			}
			applyColor(&p)
			return p
		}
	}

	// Removal we couldn't parse - surfaced in the excluded count, not silently dropped.
	return RemovalProfile{Kind: "unclassified"}
}

// effectiveCost is what the removal really costs to fire, not its printed mana
// value. Curated overrides win; then delve (drop the generic, assume fully
// delved); otherwise the printed mana value. X spells get their cost from an
// override using representativeX.
func effectiveCost(c types.Card) int {
	if o, ok := removalOverrides[c.Name]; ok && o.cost > 0 {
		return o.cost
	}
	text := strings.ToLower(c.OracleText)
	if strings.Contains(text, "delve") {
		return max(0, c.CMC-genericMana(c.ManaCost))
	}
	return c.CMC
}

// parseCapturedInt converts digits a regexp captured. A value too large for an int logs and yields 0, which the profiles read as unconstrained.
func parseCapturedInt(digits string) int {
	n, err := strconv.Atoi(digits)
	if err != nil {
		logrus.WithError(err).WithField("digits", digits).Warn("could not parse captured number")
		return 0
	}
	return n
}

// genericMana sums the generic mana ({N}) in a mana cost.
func genericMana(cost string) int {
	total := 0
	for _, m := range reGeneric.FindAllStringSubmatch(cost, -1) {
		total += parseCapturedInt(m[1])
	}
	return total
}

// removalTarget is a cube creature reduced to the axes removal cares about.
type removalTarget struct {
	name      string
	power     int
	toughness int
	mv        int
	colors    []string
	flying    bool

	// known is false when power or toughness isn't a plain integer, as in a variable-size creature.
	known bool

	// untargetable is true for hexproof or shroud, which no spot removal can
	// target.
	untargetable bool
}

// killable reports whether the profile can target the creature.
func (p RemovalProfile) killable(c removalTarget) bool {
	if c.untargetable {
		return false
	}
	if !c.known && (p.MaxToughness > 0 || p.MaxPower > 0 || p.MaxPTSum > 0) {
		return false
	}
	if p.MaxToughness > 0 && c.toughness > p.MaxToughness {
		return false
	}
	if p.MaxPower > 0 && c.power > p.MaxPower {
		return false
	}
	if p.MaxPTSum > 0 && c.power+c.toughness > p.MaxPTSum {
		return false
	}
	if p.MaxMV > 0 && c.mv > p.MaxMV {
		return false
	}
	if p.FlyingOnly && !c.flying {
		return false
	}
	if p.ColorExclude != "" && slices.Contains(c.colors, p.ColorExclude) {
		return false
	}
	if p.ColorOnly != "" && !slices.Contains(c.colors, p.ColorOnly) {
		return false
	}
	return true
}

// RemovalCard is one row of the removal page: a spot-removal card (or one mode of it) with its cost and how much of the cube it can kill.
type RemovalCard struct {
	Name     string `json:"name"`
	ManaCost string `json:"mana_cost"`

	// MV is the printed mana value.
	MV int `json:"mv"`

	// EffCost is the modeled cost of firing the removal.
	EffCost     int      `json:"eff_cost"`
	Colors      []string `json:"colors"`
	Kind        string   `json:"kind"`
	Restriction string   `json:"restriction"`
	Scalable    bool     `json:"scalable,omitempty"`

	// Raw coverage over the cube's creatures.
	Targets int     `json:"targets"`
	PctCube float64 `json:"pct_cube"`

	// MaxMVKilled is the ceiling: the priciest threat it can answer.
	MaxMVKilled int     `json:"max_mv_killed"`
	AvgMVKilled float64 `json:"avg_mv_killed"`

	// ReachEff is max_mv_killed minus eff_cost.
	ReachEff float64 `json:"reach_eff"`

	// Efficiency is avg_mv_killed minus eff_cost.
	Efficiency float64 `json:"efficiency"`

	// Play-weighted coverage: each killable threat weighted by mainboard count.
	PctPlayed         float64 `json:"pct_played"`
	PlayedAvgMVKilled float64 `json:"played_avg_mv_killed"`
	PlayedEfficiency  float64 `json:"played_efficiency"`
}

// RemovalResponse is the removal page payload: one row per removal card or mode, plus hard-to-remove creatures and per-color rollups.
type RemovalResponse struct {
	Cards           []RemovalCard `json:"cards"`
	CreatureCount   int           `json:"creature_count"`
	TotalPlayWeight int           `json:"total_play_weight"`
	Excluded        int           `json:"excluded"`

	// RemovalCards counts distinct spot-removal cards, so a multi-mode card
	// counts once. Creatures and ByColor are built from the same cards.
	RemovalCards int               `json:"removal_cards"`
	Creatures    []HardToRemoveRow `json:"creatures"`
	ByColor      []RemovalColorRow `json:"by_color"`
}

// RemovalHandler serves the removal page statistics for the requested cube and date range.
func RemovalHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &removalHandler{q: deckquery.New(store, src)}
}

type removalHandler struct {
	q *deckquery.Query
}

// ServeHTTP scores the cube's spot removal against its creatures and writes the result as JSON.
func (h *removalHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cubeID := server.CubeFromRequest(r)
	cube, err := h.q.Cube(cubeID)
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}

	creatures := make([]removalTarget, 0)
	for _, c := range cube.Cards {
		if c.IsCreature() {
			creatures = append(creatures, toRemovalTarget(c))
		}
	}

	// The date range weights creatures by how often they were played in it. The
	// card list always comes from the current cube.
	decksReq := &storage.DecksRequest{Start: query.GetString(r, "start"), End: query.GetString(r, "end")}
	numPlaysByCard := map[string]int{}
	if decks, err := h.q.Decks(cubeID, decksReq); err != nil {
		logrus.WithError(err).Warn("could not load decks for removal play weights, scoring coverage unweighted")
	} else {
		for _, d := range decks {
			for _, c := range d.Mainboard {
				numPlaysByCard[c.Name]++
			}
		}
	}
	totalWeight := 0
	for _, cr := range creatures {
		totalWeight += numPlaysByCard[cr.name]
	}

	// Score the removal, then derive the per-creature and per-color tables from it.
	resp := RemovalResponse{CreatureCount: len(creatures), TotalPlayWeight: totalWeight}
	spot, rows, excluded := cubeSpotRemoval(cube, creatures, numPlaysByCard, totalWeight)
	resp.Cards = rows
	resp.Excluded = excluded
	resp.RemovalCards = len(spot)
	resp.Creatures = hardToRemove(spot, creatures)
	resp.ByColor = removalByColor(spot)

	// Default to widest coverage first, with scalable removal grouped at the
	// bottom (it has no comparable coverage).
	sort.SliceStable(resp.Cards, func(i, j int) bool {
		a, b := resp.Cards[i], resp.Cards[j]
		if a.Scalable != b.Scalable {
			return !a.Scalable
		}
		return a.PctCube > b.PctCube
	})

	logrus.WithFields(logrus.Fields{"spot": len(resp.Cards), "excluded": resp.Excluded}).Info("/api/stats/removal")

	writeJSON(rw, resp, "removal")
}

// buildRemovalCard scores one removal profile against the cube's creatures at
// the given effective cost. numPlaysByCard and totalWeight weight the coverage
// by mainboard plays; nil and 0 leave the play-weighted numbers at zero.
// Scalable profiles come back with no coverage.
func buildRemovalCard(c types.Card, profile RemovalProfile, cost int, creatures []removalTarget, numPlaysByCard map[string]int, totalWeight int) RemovalCard {
	row := RemovalCard{
		Name:        c.Name,
		ManaCost:    c.ManaCost,
		MV:          c.CMC,
		EffCost:     cost,
		Colors:      c.Colors,
		Kind:        profile.Kind,
		Restriction: profile.Restriction,
		Scalable:    profile.Scalable,
	}

	// Scalable removal (variable X, fights) has no well-defined coverage or
	// efficiency, so leave those blank rather than fabricate them.
	if profile.Scalable {
		return row
	}

	// Tally the creatures it can kill, raw and weighted by plays.
	sumMV, playedTargets, playedSumMV, maxMV := 0, 0, 0, 0
	for _, creature := range creatures {
		if !profile.killable(creature) {
			continue
		}
		row.Targets++
		sumMV += creature.mv
		maxMV = max(maxMV, creature.mv)
		plays := numPlaysByCard[creature.name]
		playedTargets += plays
		playedSumMV += plays * creature.mv
	}

	// Turn the tallies into coverage and efficiency.
	row.MaxMVKilled = maxMV
	if len(creatures) > 0 {
		row.PctCube = round1(100 * float64(row.Targets) / float64(len(creatures)))
	}
	if row.Targets > 0 {
		row.AvgMVKilled = round1(float64(sumMV) / float64(row.Targets))
		row.Efficiency = round1(row.AvgMVKilled - float64(cost))
		row.ReachEff = round1(float64(maxMV) - float64(cost))
	}
	if totalWeight > 0 {
		row.PctPlayed = round1(100 * float64(playedTargets) / float64(totalWeight))
	}
	if playedTargets > 0 {
		row.PlayedAvgMVKilled = round1(float64(playedSumMV) / float64(playedTargets))
		row.PlayedEfficiency = round1(row.PlayedAvgMVKilled - float64(cost))
	}
	return row
}

// toRemovalTarget reduces a cube creature to what removal cares about. Power or
// toughness that isn't an integer ("*") leaves known false.
func toRemovalTarget(c types.Card) removalTarget {
	p, pErr := strconv.Atoi(c.Power)
	t, tErr := strconv.Atoi(c.Toughness)
	return removalTarget{
		name:      c.Name,
		power:     p,
		toughness: t,
		mv:        c.CMC,
		colors:    c.Colors,
		flying:    reHasFlying.MatchString(strings.ToLower(c.OracleText)),
		known:     pErr == nil && tErr == nil,

		untargetable: reUntargetable.MatchString(c.OracleText),
	}
}

// round1 rounds to one decimal place.
func round1(f float64) float64 {
	return math.Round(f*10) / 10
}

var reReminder = regexp.MustCompile(`\([^)]*\)`)

// reminderTextStripped drops parenthetical reminder text so phrases like the
// delve reminder don't interfere with parsing the real rules text.
func reminderTextStripped(s string) string {
	return reReminder.ReplaceAllString(s, "")
}

// cubeSpotRemoval builds the cube's spot removal: one spotCard per card, the
// table rows (one per mode for multi-mode cards), and how many removal cards
// weren't spot removal. numPlaysByCard and totalWeight weight coverage by play;
// nil and 0 leave the play-weighted numbers at zero.
func cubeSpotRemoval(cube *types.Cube, creatures []removalTarget, numPlaysByCard map[string]int, totalWeight int) ([]spotCard, []RemovalCard, int) {
	var spot []spotCard
	var rows []RemovalCard
	excluded := 0
	for _, c := range cube.Cards {
		card, ok := spotRemovalCard(c, creatures, numPlaysByCard, totalWeight)
		if !ok {
			if c.IsRemoval() {
				excluded++
			}
			continue
		}
		spot = append(spot, card)
		rows = append(rows, card.rows...)
	}
	return spot, rows, excluded
}

// spotRemovalCard builds one card's spot-removal entry, false when it isn't
// spot removal. Multi-mode removal (kicker, revolt) gets one row per mode.
func spotRemovalCard(c types.Card, creatures []removalTarget, numPlaysByCard map[string]int, totalWeight int) (spotCard, bool) {
	card := spotCard{name: c.Name, colors: c.Colors}
	if o, ok := removalOverrides[c.Name]; ok && len(o.modes) > 0 {
		for _, m := range o.modes {
			row := buildRemovalCard(c, m.profile, m.cost, creatures, numPlaysByCard, totalWeight)
			row.Name = fmt.Sprintf("%s (%s)", c.Name, m.label)
			card.modes = append(card.modes, m.profile)
			card.rows = append(card.rows, row)
		}
		return card, true
	}
	profile := classifyRemoval(c)
	if !profile.Spot {
		return spotCard{}, false
	}
	card.modes = append(card.modes, profile)
	card.rows = append(card.rows, buildRemovalCard(c, profile, effectiveCost(c), creatures, numPlaysByCard, totalWeight))
	return card, true
}
