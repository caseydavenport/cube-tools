package stats

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// The removal page scores each piece of spot removal by how much of the cube's
// creature base it can kill (given its power/toughness/mana-value/color
// restrictions) and how mana-efficient it is versus the threats it answers. It
// exists to make the "efficiency and restrictiveness" tuning lever concrete: the
// cube leans on cheap removal by design, so the question is which removal is
// unconditionally efficient vs appropriately restricted.
//
// Cost modelling matters here: a card's printed mana value is often not the real
// cost of its removal (delve, X spells, cost reducers, and activated abilities on
// permanents/lands). We use a delve heuristic and an X≈3 heuristic, and a small
// curated table for the one-off oddballs, so the efficiency numbers reflect what
// the removal actually costs to fire.

// representativeX is the value we assume for X-cost removal ("average" case).
const representativeX = 3

// RemovalProfile is the parsed kill condition of a spot-removal spell. A zero
// value on a Max* axis means that axis is unconstrained.
type RemovalProfile struct {
	Spot         bool
	Kind         string // "destroy", "exile", "damage", "shrink", "fight"
	Restriction  string // human label, e.g. "toughness ≤ 3", "P+T ≤ 5", "any creature"
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

var removalOverrides = map[string]removalOverride{
	// Reduced / alternate cast costs.
	"Leyline Binding": {cost: 2}, // domain, typically ~{1}-{2} in a 5-color cube
	"Ride's End":      {cost: 2}, // {3} less targeting a tapped permanent
	// Activated / channel removal on permanents & lands: cost is the ability, not
	// the card's mana value.
	"Barbarian Ring":              {cost: 1},
	"Eiganjo, Seat of the Empire": {cost: 3},
	"Seal of Fire":                {cost: 1},
	"Pyrite Spellbomb":            {cost: 2},
	"Grim Lavamancer":             {cost: 2},
	// Effects our regexes misread.
	"Prismatic Ending": {cost: representativeX + 1, profile: &RemovalProfile{Spot: true, Kind: "exile", MaxMV: representativeX, Restriction: fmt.Sprintf("MV ≤ %d (X≈%d)", representativeX, representativeX)}},
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
)

var colorLetter = map[string]string{"white": "W", "blue": "U", "black": "B", "red": "R", "green": "G"}

// classifyRemoval parses a card into its spot-removal profile. Cards that aren't
// removal, or are sweepers/edicts/tempo/graveyard-hate/unparseable, come back with
// Spot=false.
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

	// Destroy/exile with an explicit qualifier - check before plain destroy.
	if m := rePTSum.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: verb, MaxPTSum: n, Restriction: fmt.Sprintf("P+T ≤ %d", n)}
		applyColor(&p)
		return p
	}
	if m := reMV.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: verb, MaxMV: n, Restriction: fmt.Sprintf("MV ≤ %d%s", n, kicked)}
		applyColor(&p)
		return p
	}
	if m := rePower.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: verb, MaxPower: n, Restriction: fmt.Sprintf("power ≤ %d", n)}
		applyColor(&p)
		return p
	}
	if m := reToughness.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: verb, MaxToughness: n, Restriction: fmt.Sprintf("toughness ≤ %d", n)}
		applyColor(&p)
		return p
	}

	// Damage / -X/-X shrink both cap by toughness. A literal X is scalable and
	// too variable to assign a representative value - those are grouped separately
	// (a bounded X like Prismatic Ending gets a curated profile instead).
	if m := reDamage.FindStringSubmatch(text); m != nil {
		if m[1] == "x" {
			return RemovalProfile{Spot: true, Kind: "damage", Scalable: true, Restriction: "scalable (X damage)"}
		}
		n, _ := strconv.Atoi(m[1])
		return RemovalProfile{Spot: true, Kind: "damage", MaxToughness: n, Restriction: fmt.Sprintf("toughness ≤ %d", n)}
	}
	if m := reMinus.FindStringSubmatch(text); m != nil {
		if m[2] == "x" {
			return RemovalProfile{Spot: true, Kind: "shrink", Scalable: true, Restriction: "scalable (-X/-X)"}
		}
		n, _ := strconv.Atoi(m[2])
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
// delved) and X (assume X≈3); otherwise the printed mana value.
func effectiveCost(c types.Card) int {
	if o, ok := removalOverrides[c.Name]; ok && o.cost > 0 {
		return o.cost
	}
	text := strings.ToLower(c.OracleText)
	if strings.Contains(text, "delve") {
		if cost := c.CMC - genericMana(c.ManaCost); cost >= 0 {
			return cost
		}
		return 0
	}
	return c.CMC
}

// genericMana sums the generic mana ({N}) in a mana cost.
func genericMana(cost string) int {
	total := 0
	for _, m := range reGeneric.FindAllStringSubmatch(cost, -1) {
		n, _ := strconv.Atoi(m[1])
		total += n
	}
	return total
}

// creatureInfo is a cube creature reduced to the axes removal cares about.
type creatureInfo struct {
	name      string
	power     int
	toughness int
	mv        int
	colors    []string
	flying    bool
	known     bool // false when power/toughness aren't plain integers (e.g. */*)
}

func (p RemovalProfile) killable(c creatureInfo) bool {
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
	if p.ColorExclude != "" && hasColor(c.colors, p.ColorExclude) {
		return false
	}
	if p.ColorOnly != "" && !hasColor(c.colors, p.ColorOnly) {
		return false
	}
	return true
}

func hasColor(colors []string, c string) bool {
	for _, x := range colors {
		if x == c {
			return true
		}
	}
	return false
}

type RemovalCard struct {
	Name        string   `json:"name"`
	ManaCost    string   `json:"mana_cost"`
	MV          int      `json:"mv"`       // printed mana value
	EffCost     int      `json:"eff_cost"` // modelled cost of firing the removal
	Colors      []string `json:"colors"`
	Kind        string   `json:"kind"`
	Restriction string   `json:"restriction"`
	Scalable    bool     `json:"scalable,omitempty"`

	// Raw coverage over the cube's creatures.
	Targets     int     `json:"targets"`
	PctCube     float64 `json:"pct_cube"`
	MaxMVKilled int     `json:"max_mv_killed"` // ceiling: priciest threat it can answer
	AvgMVKilled float64 `json:"avg_mv_killed"`
	ReachEff    float64 `json:"reach_eff"`  // max_mv_killed - eff_cost
	Efficiency  float64 `json:"efficiency"` // avg_mv_killed - eff_cost

	// Play-weighted coverage: each killable threat weighted by mainboard count.
	PctPlayed         float64 `json:"pct_played"`
	PlayedAvgMVKilled float64 `json:"played_avg_mv_killed"`
	PlayedEfficiency  float64 `json:"played_efficiency"`
}

type RemovalResponse struct {
	Cards           []RemovalCard `json:"cards"`
	CreatureCount   int           `json:"creature_count"`
	TotalPlayWeight int           `json:"total_play_weight"`
	Excluded        int           `json:"excluded"`
}

func RemovalHandler() http.Handler {
	return &removalHandler{store: storage.NewFileDeckStoreWithCache()}
}

type removalHandler struct {
	store storage.DeckStorage
}

func (h *removalHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cubeID := server.CubeFromRequest(r)
	cube, err := types.LoadCube(fmt.Sprintf("data/%s/cube.json", cubeID))
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}

	creatures := make([]creatureInfo, 0)
	for _, c := range cube.Cards {
		if c.IsCreature() {
			creatures = append(creatures, toCreatureInfo(c))
		}
	}

	playWeight := map[string]int{}
	if decks, err := h.store.List(cubeID, &storage.DecksRequest{}); err == nil {
		for _, d := range decks {
			for _, c := range d.Mainboard {
				playWeight[c.Name]++
			}
		}
	}
	totalWeight := 0
	for _, cr := range creatures {
		totalWeight += playWeight[cr.name]
	}

	resp := RemovalResponse{CreatureCount: len(creatures), TotalPlayWeight: totalWeight}
	for _, c := range cube.Cards {
		// Multi-mode removal (kicker, revolt) is emitted as one row per mode.
		if o, ok := removalOverrides[c.Name]; ok && len(o.modes) > 0 {
			for _, m := range o.modes {
				rc := buildRemovalCard(c, m.profile, m.cost, creatures, playWeight, totalWeight)
				rc.Name = fmt.Sprintf("%s (%s)", c.Name, m.label)
				resp.Cards = append(resp.Cards, rc)
			}
			continue
		}
		prof := classifyRemoval(c)
		if !prof.Spot {
			if c.IsRemoval() {
				resp.Excluded++
			}
			continue
		}
		resp.Cards = append(resp.Cards, buildRemovalCard(c, prof, effectiveCost(c), creatures, playWeight, totalWeight))
	}

	// Default to widest reach first, with scalable removal grouped at the bottom
	// (it has no comparable efficiency number).
	sort.SliceStable(resp.Cards, func(i, j int) bool {
		a, b := resp.Cards[i], resp.Cards[j]
		if a.Scalable != b.Scalable {
			return !a.Scalable
		}
		return a.ReachEff > b.ReachEff
	})

	logrus.WithFields(logrus.Fields{"spot": len(resp.Cards), "excluded": resp.Excluded}).Info("/api/stats/removal")

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write removal response")
	}
}

func buildRemovalCard(c types.Card, prof RemovalProfile, eff int, creatures []creatureInfo, playWeight map[string]int, totalWeight int) RemovalCard {
	rc := RemovalCard{
		Name:        c.Name,
		ManaCost:    c.ManaCost,
		MV:          c.CMC,
		EffCost:     eff,
		Colors:      c.Colors,
		Kind:        prof.Kind,
		Restriction: prof.Restriction,
		Scalable:    prof.Scalable,
	}
	// Scalable removal (variable X, fights) has no well-defined coverage or
	// efficiency, so leave those blank rather than fabricate them.
	if prof.Scalable {
		return rc
	}
	sumMV, wCov, wSumMV, maxMV := 0, 0, 0, 0
	for _, cr := range creatures {
		if !prof.killable(cr) {
			continue
		}
		rc.Targets++
		sumMV += cr.mv
		if cr.mv > maxMV {
			maxMV = cr.mv
		}
		w := playWeight[cr.name]
		wCov += w
		wSumMV += w * cr.mv
	}
	rc.MaxMVKilled = maxMV
	if len(creatures) > 0 {
		rc.PctCube = round1(100 * float64(rc.Targets) / float64(len(creatures)))
	}
	if rc.Targets > 0 {
		rc.AvgMVKilled = round1(float64(sumMV) / float64(rc.Targets))
		rc.Efficiency = round1(rc.AvgMVKilled - float64(eff))
		rc.ReachEff = round1(float64(maxMV) - float64(eff))
	}
	if totalWeight > 0 {
		rc.PctPlayed = round1(100 * float64(wCov) / float64(totalWeight))
	}
	if wCov > 0 {
		rc.PlayedAvgMVKilled = round1(float64(wSumMV) / float64(wCov))
		rc.PlayedEfficiency = round1(rc.PlayedAvgMVKilled - float64(eff))
	}
	return rc
}

func toCreatureInfo(c types.Card) creatureInfo {
	p, pErr := strconv.Atoi(c.Power)
	t, tErr := strconv.Atoi(c.Toughness)
	return creatureInfo{
		name:      c.Name,
		power:     p,
		toughness: t,
		mv:        c.CMC,
		colors:    c.Colors,
		flying:    reHasFlying.MatchString(strings.ToLower(c.OracleText)),
		known:     pErr == nil && tErr == nil,
	}
}

func round1(f float64) float64 {
	return math.Round(f*10) / 10
}

var reReminder = regexp.MustCompile(`\([^)]*\)`)

// reminderTextStripped drops parenthetical reminder text so phrases like the
// delve reminder don't interfere with parsing the real rules text.
func reminderTextStripped(s string) string {
	return reReminder.ReplaceAllString(s, "")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
