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
// creature base it can actually kill (given its power/toughness/mana-value/color
// restrictions) and how mana-efficient it is versus the threats it answers. It
// exists to make the "efficiency and restrictiveness" tuning lever concrete: the
// cube leans on cheap removal by design, so the question is which removal is
// unconditionally efficient vs appropriately restricted.

// RemovalProfile is the parsed kill condition of a spot-removal spell. A zero
// value on a Max* axis means that axis is unconstrained. Spot is false for
// sweepers, edicts, tempo (bounce/tap/stun), and anything unparseable - those are
// excluded from the page.
type RemovalProfile struct {
	Spot          bool
	Kind          string // "destroy", "damage", "shrink"
	Restriction   string // human label, e.g. "toughness ≤ 3", "P+T ≤ 5", "any creature"
	MaxToughness  int
	MaxPower      int
	MaxMV         int
	MaxPTSum      int
	ColorExclude  string // kills only creatures NOT this color (e.g. "nonblack")
	ColorOnly     string // kills only creatures OF this color
	Unconditional bool
	Scalable      bool // X-based: coverage is unbounded, cost is X-dependent
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
	reDestroy   = regexp.MustCompile(`(?:destroy|exile) target (?:creature|nonland permanent|permanent|creature or planeswalker)`)
	reFight     = regexp.MustCompile(`fights target creature|damage equal to`)
	reColorOnly = regexp.MustCompile(`target (white|blue|black|red|green) (?:creature|permanent)`)
	reNonColor  = regexp.MustCompile(`non(white|blue|black|red|green) (?:creature|permanent)`)
)

var colorLetter = map[string]string{"white": "W", "blue": "U", "black": "B", "red": "R", "green": "G"}

// classifyRemoval parses a card into its spot-removal profile. Cards that aren't
// removal, or are sweepers/edicts/tempo/unparseable, come back with Spot=false.
func classifyRemoval(c types.Card) RemovalProfile {
	if !c.IsRemoval() {
		return RemovalProfile{}
	}
	text := strings.ToLower(reminderTextStripped(c.OracleText))

	// Non-spot removal is excluded from the page.
	if reSweeper.MatchString(text) {
		return RemovalProfile{Kind: "sweeper"}
	}
	if reEdict.MatchString(text) {
		return RemovalProfile{Kind: "edict"}
	}
	if reTempo.MatchString(text) && !reDestroy.MatchString(text) && !reDamage.MatchString(text) {
		return RemovalProfile{Kind: "tempo"}
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
		p := RemovalProfile{Spot: true, Kind: "destroy", MaxPTSum: n, Restriction: fmt.Sprintf("P+T ≤ %d", n)}
		applyColor(&p)
		return p
	}
	if m := reMV.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: "destroy", MaxMV: n, Restriction: fmt.Sprintf("MV ≤ %d%s", n, kicked)}
		applyColor(&p)
		return p
	}
	if m := rePower.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: "destroy", MaxPower: n, Restriction: fmt.Sprintf("power ≤ %d", n)}
		applyColor(&p)
		return p
	}
	if m := reToughness.FindStringSubmatch(text); m != nil {
		n, _ := strconv.Atoi(m[1])
		p := RemovalProfile{Spot: true, Kind: "destroy", MaxToughness: n, Restriction: fmt.Sprintf("toughness ≤ %d", n)}
		applyColor(&p)
		return p
	}

	// Damage / -X/-X shrink both cap by toughness.
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

	// Plain destroy/exile with no qualifier hits anything.
	if reDestroy.MatchString(text) {
		p := RemovalProfile{Spot: true, Kind: "destroy", Unconditional: true, Restriction: "any creature"}
		if strings.Contains(text, "delve") {
			p.Restriction = "any creature (delve)"
		}
		applyColor(&p)
		return p
	}

	// Removal we couldn't parse - surfaced in the excluded count, not silently dropped.
	return RemovalProfile{Kind: "unclassified"}
}

// creatureInfo is a cube creature reduced to the axes removal cares about.
type creatureInfo struct {
	name      string
	power     int
	toughness int
	mv        int
	colors    []string
	known     bool // false when power/toughness aren't plain integers (e.g. */*)
}

func (p RemovalProfile) killable(c creatureInfo) bool {
	// A P/T-based restriction can't be confirmed against an unknown (*) body.
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
	MV          int      `json:"mv"`
	Colors      []string `json:"colors"`
	Kind        string   `json:"kind"`
	Restriction string   `json:"restriction"`
	Scalable    bool     `json:"scalable,omitempty"`

	// Raw coverage over the cube's creatures.
	Targets     int     `json:"targets"`
	PctCube     float64 `json:"pct_cube"`
	AvgMVKilled float64 `json:"avg_mv_killed"`
	Efficiency  float64 `json:"efficiency"`

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

	// Per-creature play weight = number of mainboards it appears in.
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
		if !c.IsRemoval() {
			continue
		}
		prof := classifyRemoval(c)
		if !prof.Spot {
			resp.Excluded++
			continue
		}
		resp.Cards = append(resp.Cards, buildRemovalCard(c, prof, creatures, playWeight, totalWeight))
	}

	// Default to most mana-advantaged first.
	sort.SliceStable(resp.Cards, func(i, j int) bool {
		return resp.Cards[i].Efficiency > resp.Cards[j].Efficiency
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

func buildRemovalCard(c types.Card, prof RemovalProfile, creatures []creatureInfo, playWeight map[string]int, totalWeight int) RemovalCard {
	rc := RemovalCard{
		Name:        c.Name,
		ManaCost:    c.ManaCost,
		MV:          c.CMC,
		Colors:      c.Colors,
		Kind:        prof.Kind,
		Restriction: prof.Restriction,
		Scalable:    prof.Scalable,
	}
	sumMV, wCov, wSumMV := 0, 0, 0
	for _, cr := range creatures {
		if !prof.killable(cr) {
			continue
		}
		rc.Targets++
		sumMV += cr.mv
		w := playWeight[cr.name]
		wCov += w
		wSumMV += w * cr.mv
	}
	if len(creatures) > 0 {
		rc.PctCube = round1(100 * float64(rc.Targets) / float64(len(creatures)))
	}
	if rc.Targets > 0 {
		rc.AvgMVKilled = round1(float64(sumMV) / float64(rc.Targets))
		rc.Efficiency = round1(rc.AvgMVKilled - float64(rc.MV))
	}
	if totalWeight > 0 {
		rc.PctPlayed = round1(100 * float64(wCov) / float64(totalWeight))
	}
	if wCov > 0 {
		rc.PlayedAvgMVKilled = round1(float64(wSumMV) / float64(wCov))
		rc.PlayedEfficiency = round1(rc.PlayedAvgMVKilled - float64(rc.MV))
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
