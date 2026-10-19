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
	CardName string `json:"card_name"`
	Pooled   int    `json:"pooled"`
	Cube     int    `json:"cube"`
	Kind     string `json:"kind"`

	// Captures are the pool boxes (across players) that resolved to this name,
	// so the fix UI can show each one and reassign it. Only populated for "over"
	// and "unknown" (a "missing" card has no boxes by definition).
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
	n := 0
	for _, d := range r.Discrepancies {
		if d.Kind == "over" || d.Kind == "unknown" {
			n++
		}
	}
	return n
}

func buildConsistencyReport(cl *types.Cube, sess *Session, playersTotal int) ConsistencyReport {
	var cards []types.CountedCard
	counted := 0
	for _, pw := range sess.Players {
		if pw == nil {
			continue
		}
		if drafted := draftedCards(pw); len(drafted) > 0 {
			cards = append(cards, drafted...)
			counted++
		}
	}
	check := cl.CheckDraft(cards)

	report := ConsistencyReport{
		PoolTotal:      check.SeenTotal(),
		CubeTotal:      check.CubeTotal,
		PlayersCounted: counted,
		PlayersTotal:   playersTotal,
	}
	for _, d := range check.Discrepancies {
		report.Discrepancies = append(report.Discrepancies, Discrepancy{CardName: d.CardName, Pooled: d.Seen, Cube: d.Cube, Kind: string(d.Kind)})
	}
	attachCaptures(&report, sess)
	return report
}

// draftedCards returns a player's drafted non-basic cards. A pool scan stores
// the full pool, which is the 45 drafted cards, so use it directly. A
// deck-only scan has no pool, so its mainboard plus hand-tracked sideboard is
// the same list. Mirrors poolCountsFromDeck's pool-then-deck fallback.
func draftedCards(pw *PlayerWork) []types.CountedCard {
	var out []types.CountedCard
	add := func(name string, n int) {
		if n > 0 && !types.IsBasic(name) {
			out = append(out, types.CountedCard{Name: name, Count: n})
		}
	}
	if len(pw.PoolEntries) > 0 {
		for _, e := range pw.PoolEntries {
			add(e.CardName, e.Count)
		}
		return out
	}
	for _, e := range pw.MainboardEntries {
		add(e.CardName, e.Count)
	}
	for name, n := range pw.Sideboard {
		add(name, n)
	}
	return out
}

// attachCaptures fills in the pool boxes behind each over/unknown discrepancy
// so the draft view can show and reassign them. A missing card has no boxes
// (that's why it's missing), so it gets none.
func attachCaptures(report *ConsistencyReport, sess *Session) {
	want := map[string]bool{}
	for _, d := range report.Discrepancies {
		if d.Kind == "over" || d.Kind == "unknown" {
			want[strings.ToLower(d.CardName)] = true
		}
	}
	if len(want) == 0 {
		return
	}

	byName := map[string][]Capture{}
	for player, pw := range sess.Players {
		if pw == nil {
			continue
		}
		for photo, boxes := range pw.Boxes {
			for _, b := range boxes {
				if b.Chosen == "" || b.Status == "pending" || b.Status == "unmatched" {
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

func ConsistencyHandler() http.Handler { return ConsistencyHandlerWithRoot("data") }

func ConsistencyHandlerWithRoot(dataRoot string) http.Handler {
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

		cl, err := loadCubeForDraft(dataRoot, server.CubeFromRequest(r), draft)
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}

		sess, err := LoadSession(draft)
		if err != nil {
			sess = &Session{Players: map[string]*PlayerWork{}}
		}
		writeJSON(rw, buildConsistencyReport(cl, sess, len(players)))
	})
}
