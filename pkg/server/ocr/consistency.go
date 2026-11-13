package ocr

import (
	"net/http"
	"sort"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Discrepancy is one card whose total across all pools doesn't match the cube
// list. Kind is "over" (pooled more copies than the cube has), "missing"
// (fewer, including zero), or "unknown" (a name not in the cube at all).
type Discrepancy struct {
	CardName string                `json:"card_name"`
	Seen     int                   `json:"seen"`
	Cube     int                   `json:"cube"`
	Kind     types.DiscrepancyKind `json:"kind"`

	// Captures are the pool boxes, across players, that resolved to this name,
	// so the fix UI can show and reassign each one. Only "over" and "unknown"
	// have them, since a "missing" card has no boxes.
	Captures []Capture `json:"captures,omitempty"`
}

// Capture is one pool box that resolved to a discrepancy's card name, with
// enough to crop its nameplate and reassign it from the draft view.
type Capture struct {
	Player     string             `json:"player"`
	Photo      string             `json:"photo"`
	BoxID      string             `json:"box_id"`
	Bbox       ocrpkg.Bbox        `json:"bbox"`
	Chosen     string             `json:"chosen"`
	Candidates []ocrpkg.Candidate `json:"candidates,omitempty"`
}

// ConsistencyReport compares the sum of every player's pool against the cube
// list. A clean draft pools each cube card exactly its max-copies count, so any
// discrepancy points at an OCR miss (over/unknown) or a player not yet done
// (missing).
type ConsistencyReport struct {
	PoolTotal      int           `json:"pool_total"`
	CubeTotal      int           `json:"cube_total"`
	PlayersCounted int           `json:"players_counted"`
	PlayersTotal   int           `json:"players_total"`
	Discrepancies  []Discrepancy `json:"discrepancies"`
}

// Conflicts counts the discrepancies that are real OCR errors (over-counts and
// names not in the cube), ignoring "missing" which is expected until every
// player is scanned. The draft list uses this for a per-draft warning badge.
func (r ConsistencyReport) Conflicts() int {
	numConflicts := 0
	for _, d := range r.Discrepancies {
		if d.Kind == types.DiscrepancyOver || d.Kind == types.DiscrepancyUnknown {
			numConflicts++
		}
	}
	return numConflicts
}

// buildConsistencyReport sums every player's drafted cards from the session
// and compares them with the cube list, then attaches the boxes behind each
// over-count or unknown name. playersTotal is how many players the draft has.
func buildConsistencyReport(cube *types.Cube, session *Session, playersTotal int) ConsistencyReport {
	var cards []types.CountedCard
	numPlayers := 0
	for _, work := range session.Players {
		if work == nil {
			continue
		}
		if drafted := draftedCards(work); len(drafted) > 0 {
			cards = append(cards, drafted...)
			numPlayers++
		}
	}
	check := cube.CheckDraft(cards)

	report := ConsistencyReport{
		PoolTotal:      check.SeenTotal(),
		CubeTotal:      check.CubeTotal,
		PlayersCounted: numPlayers,
		PlayersTotal:   playersTotal,
	}
	for _, d := range check.Discrepancies {
		report.Discrepancies = append(report.Discrepancies, Discrepancy{CardName: d.CardName, Seen: d.Seen, Cube: d.Cube, Kind: d.Kind})
	}
	attachCaptures(&report, session)
	return report
}

// draftedCards returns a player's drafted non-basic cards. A pool scan stores
// the full pool, which is the 45 drafted cards, so use it directly. A
// deck-only scan has no pool, so its mainboard plus hand-tracked sideboard is
// the same list. Mirrors poolCountsFromDeck's pool-then-deck fallback.
func draftedCards(work *PlayerWork) []types.CountedCard {
	var out []types.CountedCard
	add := func(name string, n int) {
		if n > 0 && !types.IsBasic(name) {
			out = append(out, types.CountedCard{Name: name, Count: n})
		}
	}
	if len(work.PoolCards) > 0 {
		for _, card := range work.PoolCards {
			add(card.CardName, card.Count)
		}
		return out
	}
	for _, card := range work.MainboardCards {
		add(card.CardName, card.Count)
	}
	for name, n := range work.Sideboard {
		add(name, n)
	}
	return out
}

// attachCaptures fills in the pool boxes behind each over/unknown discrepancy
// so the draft view can show and reassign them. A missing card has no boxes
// (that's why it's missing), so it gets none.
func attachCaptures(report *ConsistencyReport, session *Session) {
	want := map[string]bool{}
	for _, d := range report.Discrepancies {
		if d.Kind == types.DiscrepancyOver || d.Kind == types.DiscrepancyUnknown {
			want[strings.ToLower(d.CardName)] = true
		}
	}
	if len(want) == 0 {
		return
	}

	byName := map[string][]Capture{}
	for player, work := range session.Players {
		if work == nil {
			continue
		}
		for photo, boxes := range work.Boxes {
			for _, b := range boxes {
				if b.Chosen == "" || b.Status == boxPending || b.Status == boxUnmatched {
					continue
				}
				key := strings.ToLower(b.Chosen)
				if !want[key] {
					continue
				}
				byName[key] = append(byName[key], Capture{
					Player:     player,
					Photo:      photo,
					BoxID:      b.ID,
					Bbox:       b.Bbox,
					Chosen:     b.Chosen,
					Candidates: b.Candidates,
				})
			}
		}
	}

	for i := range report.Discrepancies {
		d := &report.Discrepancies[i]
		if caps := byName[strings.ToLower(d.CardName)]; len(caps) > 0 {
			sort.Slice(caps, func(a, b int) bool {
				if caps[a].Player != caps[b].Player {
					return drafts.NaturalLess(caps[a].Player, caps[b].Player)
				}
				return drafts.NaturalLess(caps[a].Photo, caps[b].Photo)
			})
			d.Captures = caps
		}
	}
}

// ConsistencyHandler serves a draft's consistency report: every player's pool
// summed and compared with the cube list. It is 404 for an unknown draft or one
// with no photos, and a missing session reports every card as missing.
func ConsistencyHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		players, err := discoverPlayers(draft)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		if players == nil {
			http.NotFound(rw, r)
			return
		}

		cube, err := loadCubeForDraft(dataRoot, server.CubeFromRequest(r), draft)
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(rw, buildConsistencyReport(cube, loadSessionOrEmpty(draft), len(players)))
	})
}
