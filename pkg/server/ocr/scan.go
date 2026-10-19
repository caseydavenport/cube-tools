package ocr

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/server"
)

// scanWorkers bounds how many photos are detected at once. Detection is
// CPU-heavy (OpenCV + tesseract), so a small pool keeps the box responsive
// without thrashing.
const scanWorkers = 3

// scanState is a background scan's lifecycle: idle (no job for this draft),
// running, or done.
type scanState string

const (
	scanIdle    scanState = "idle"
	scanRunning scanState = "running"
	scanDone    scanState = "done"
)

// scanJob tracks a background "scan all photos" run for one draft. The operator
// kicks it off from the draft's player list and walks away; the workspace reads
// boxes from the session as usual once the job has filled them in.
type scanJob struct {
	mu sync.Mutex

	state   scanState
	total   int
	done    int
	current string
	err     string
}

type scanStatus struct {
	State   scanState `json:"state"`
	Total   int       `json:"total"`
	Done    int       `json:"done"`
	Current string    `json:"current,omitempty"`
	Error   string    `json:"error,omitempty"`
}

func (j *scanJob) status() scanStatus {
	j.mu.Lock()
	defer j.mu.Unlock()
	return scanStatus{State: j.state, Total: j.total, Done: j.done, Current: j.current, Error: j.err}
}

// scanJobs holds the live (or just-finished) job per draft. A finished job is
// kept so the UI can read a "done" status right after a run, but finished jobs
// are pruned the next time any scan starts so the map can't grow without bound.
var (
	scanJobsMu sync.Mutex
	scanJobs   = map[string]*scanJob{}
)

func scanKey(cube string, draftID int) string {
	return fmt.Sprintf("%s/%d", cube, draftID)
}

// scanItem is one photo to detect, tagged with the player it belongs to and
// whether it's a deck photo (so the boxes land in the right session map).
type scanItem struct {
	player string
	photo  string
	deck   bool
}

// buildScanWorklist lists every pool and deck photo across all players that has
// no boxes yet. Photos already scanned or hand-corrected are skipped, so the
// scan is idempotent and never clobbers existing work.
func buildScanWorklist(draft drafts.Draft) ([]scanItem, error) {
	players, err := discoverPlayers(draft)
	if err != nil {
		return nil, err
	}
	sess, err := LoadSession(draft)
	if err != nil {
		sess = &Session{Players: map[string]*PlayerWork{}}
	}

	var items []scanItem
	for _, p := range players {
		pw := sess.Players[p.ID]
		poolPhotos := append(append([]string{}, p.Photos.Checkin...), p.Photos.Checkout...)
		for _, ph := range poolPhotos {
			if pw != nil && len(pw.Boxes[ph]) > 0 {
				continue
			}
			items = append(items, scanItem{player: p.ID, photo: ph, deck: false})
		}
		for _, ph := range p.Photos.Deck {
			if pw != nil && len(pw.DeckBoxes[ph]) > 0 {
				continue
			}
			items = append(items, scanItem{player: p.ID, photo: ph, deck: true})
		}
	}
	return items, nil
}

func ScanStartHandler(det Detector, dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		key := scanKey(cube, draft.ID)

		scanJobsMu.Lock()
		// A scan is already running for this draft: report it rather than
		// starting a second one that would race on the same session file.
		if j, ok := scanJobs[key]; ok && j.status().State == scanRunning {
			scanJobsMu.Unlock()
			writeJSON(rw, j.status())
			return
		}
		// Drop finished jobs (this draft's and any others') so the map only ever
		// holds the running scans plus the one we're about to start.
		for k, j := range scanJobs {
			if j.status().State != scanRunning {
				delete(scanJobs, k)
			}
		}
		items, err := buildScanWorklist(draft)
		if err != nil {
			scanJobsMu.Unlock()
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		job := &scanJob{state: scanRunning, total: len(items)}
		scanJobs[key] = job
		scanJobsMu.Unlock()

		go runScan(det, dataRoot, cube, draft, items, job)
		writeJSON(rw, job.status())
	})
}

// ScanStatusHandler reports the progress of a draft's photo scan,
// finding the draft under dataRoot.
func ScanStatusHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		scanJobsMu.Lock()
		j := scanJobs[scanKey(server.CubeFromRequest(r), draft.ID)]
		scanJobsMu.Unlock()
		if j == nil {
			writeJSON(rw, scanStatus{State: scanIdle})
			return
		}
		writeJSON(rw, j.status())
	})
}

func runScan(det Detector, dataRoot, cube string, draft drafts.Draft, items []scanItem, job *scanJob) {
	sleeveColor := sleeveColorFor(dataRoot, cube)
	workers := min(scanWorkers, len(items))
	ch := make(chan scanItem)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for it := range ch {
				scanOne(det, dataRoot, cube, draft, it, sleeveColor, job)
			}
		}()
	}
	for _, it := range items {
		ch <- it
	}
	close(ch)
	wg.Wait()

	job.mu.Lock()
	job.state = scanDone
	job.current = ""
	job.mu.Unlock()
}

func scanOne(det Detector, dataRoot, cube string, draft drafts.Draft, it scanItem, sleeveColor string, job *scanJob) {
	job.mu.Lock()
	job.current = it.photo
	job.mu.Unlock()
	defer func() {
		job.mu.Lock()
		job.done++
		job.mu.Unlock()
	}()

	abs, cl, ok := resolvePhoto(dataRoot, cube, draft, it.photo)
	if !ok {
		return
	}
	results, err := det.DetectPhoto(abs, cl, sleeveColor)
	if err != nil {
		// Leave this photo empty so the operator can scan it by hand later, but
		// surface the first failure in the job status and the log.
		logrus.WithError(err).WithField("photo", it.photo).Warn("Background scan failed to detect photo")
		job.mu.Lock()
		if job.err == "" {
			job.err = err.Error()
		}
		job.mu.Unlock()
		return
	}
	boxes := make([]Box, 0, len(results))
	for i, res := range results {
		boxes = append(boxes, resultToBox(it.photo, i, res))
	}
	writeScannedBoxes(draft, it, boxes)
}

// resultToBox mirrors the client's linesToBoxes so background-scanned boxes are
// identical to ones produced by the per-photo Scan button.
func resultToBox(photo string, i int, r ocrpkg.MatchResult) Box {
	jl := toLineJSON(r)
	return Box{
		ID:         fmt.Sprintf("%s:%d", photo, i),
		Bbox:       jl.Bbox,
		Status:     jl.Band,
		Chosen:     jl.Chosen,
		Candidates: jl.Candidates,
	}
}

// writeScannedBoxes merges one photo's boxes into the session. It takes the same
// lock as the client autosave and re-checks that the photo is still empty, so a
// player the operator opened and started correcting mid-scan is never clobbered.
func writeScannedBoxes(draft drafts.Draft, it scanItem, boxes []Box) {
	sessionSaveMu.Lock()
	defer sessionSaveMu.Unlock()

	session, err := LoadSession(draft)
	if err != nil {
		logrus.WithError(err).WithField("draft", draft.ID).Warn("Background scan could not load session")
		return
	}
	session.DraftID = draft.ID
	playerWork := session.Players[it.player]
	if playerWork == nil {
		playerWork = &PlayerWork{}
		session.Players[it.player] = playerWork
	}
	if it.deck {
		if playerWork.DeckBoxes == nil {
			playerWork.DeckBoxes = map[string][]Box{}
		}
		if len(playerWork.DeckBoxes[it.photo]) > 0 {
			return
		}
		playerWork.DeckBoxes[it.photo] = boxes
	} else {
		if playerWork.Boxes == nil {
			playerWork.Boxes = map[string][]Box{}
		}
		if len(playerWork.Boxes[it.photo]) > 0 {
			return
		}
		playerWork.Boxes[it.photo] = boxes
	}
	if err := session.Save(draft); err != nil {
		logrus.WithError(err).WithField("draft", draft.ID).Warn("Background scan could not save session")
	}
}
