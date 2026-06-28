package ocr

import (
	"net/http"
	"sort"
	"strings"

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

// over and unknown are real OCR errors regardless of progress, so they sort
// ahead of missing (which is expected until every player is scanned).
var discrepancyOrder = map[string]int{
	"unknown": 0,
	"over":    1,
	"missing": 2,
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
	// Pool counts summed across players, keyed by lowercased name so they line
	// up with the cube's case-insensitive copy counts. Basics are entered
	// through their own control and aren't part of the cube list, so skip them.
	pooled := map[string]int{}
	display := map[string]string{}
	counted := 0
	for _, pw := range sess.Players {
		if pw == nil {
			continue
		}
		had := false
		for _, e := range pw.PoolEntries {
			if e.Count <= 0 || types.IsBasic(e.CardName) {
				continue
			}
			key := strings.ToLower(e.CardName)
			pooled[key] += e.Count
			if _, ok := display[key]; !ok {
				display[key] = e.CardName
			}
			had = true
		}
		if had {
			counted++
		}
	}

	report := ConsistencyReport{PlayersCounted: counted, PlayersTotal: playersTotal}
	inCube := map[string]bool{}
	for _, name := range cl.Names() {
		want := cl.MaxCopies(name)
		report.CubeTotal += want
		key := strings.ToLower(name)
		inCube[key] = true
		if got := pooled[key]; got != want {
			kind := "missing"
			if got > want {
				kind = "over"
			}
			report.Discrepancies = append(report.Discrepancies, Discrepancy{CardName: name, Pooled: got, Cube: want, Kind: kind})
		}
	}
	for key, got := range pooled {
		report.PoolTotal += got
		if !inCube[key] {
			report.Discrepancies = append(report.Discrepancies, Discrepancy{CardName: display[key], Pooled: got, Cube: 0, Kind: "unknown"})
		}
	}
	attachCaptures(&report, sess)
	sort.Slice(report.Discrepancies, func(i, j int) bool {
		a, b := report.Discrepancies[i], report.Discrepancies[j]
		if a.Kind != b.Kind {
			return discrepancyOrder[a.Kind] < discrepancyOrder[b.Kind]
		}
		return a.CardName < b.CardName
	})
	return report
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
					return caps[a].Player < caps[b].Player
				}
				return caps[a].Photo < caps[b].Photo
			})
			d.Captures = caps
		}
	}
}

func ConsistencyHandler() http.Handler { return ConsistencyHandlerWithRoot("data") }

func ConsistencyHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || !validDraftID(draftID) {
			http.NotFound(rw, r)
			return
		}
		players, err := discoverPlayers(dataRoot, cube, draftID)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		if players == nil {
			http.NotFound(rw, r)
			return
		}

		cl, err := loadCubeForDraft(dataRoot, cube, draftID)
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}

		sess, err := LoadSession(dataRoot, cube, draftID)
		if err != nil {
			sess = &Session{Players: map[string]*PlayerWork{}}
		}
		writeJSON(rw, buildConsistencyReport(cl, sess, len(players)))
	})
}
