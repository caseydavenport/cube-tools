package ocr

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/sirupsen/logrus"

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

func scanKey(cube, draftID string) string { return cube + "/" + draftID }

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
func buildScanWorklist(dataRoot, cube, draftID string) ([]scanItem, error) {
	players, err := discoverPlayers(dataRoot, cube, draftID)
	if err != nil {
		return nil, err
	}
	sess, err := LoadSession(dataRoot, cube, draftID)
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

func ScanStartHandler(det Detector) http.Handler { return ScanStartHandlerWithRoot(det, "data") }

func ScanStartHandlerWithRoot(det Detector, dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || !validDraftID(draftID) {
			http.NotFound(rw, r)
			return
		}
		key := scanKey(cube, draftID)

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
		items, err := buildScanWorklist(dataRoot, cube, draftID)
		if err != nil {
			scanJobsMu.Unlock()
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		job := &scanJob{state: scanRunning, total: len(items)}
		scanJobs[key] = job
		scanJobsMu.Unlock()

		go runScan(det, dataRoot, cube, draftID, items, job)
		writeJSON(rw, job.status())
	})
}

func ScanStatusHandler() http.Handler { return ScanStatusHandlerWithRoot("data") }

func ScanStatusHandlerWithRoot(_ string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || !validDraftID(draftID) {
			http.NotFound(rw, r)
			return
		}
		scanJobsMu.Lock()
		j := scanJobs[scanKey(cube, draftID)]
		scanJobsMu.Unlock()
		if j == nil {
			writeJSON(rw, scanStatus{State: scanIdle})
			return
		}
		writeJSON(rw, j.status())
	})
}

func runScan(det Detector, dataRoot, cube, draftID string, items []scanItem, job *scanJob) {
	workers := min(scanWorkers, len(items))
	ch := make(chan scanItem)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for it := range ch {
				scanOne(det, dataRoot, cube, draftID, it, job)
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

func scanOne(det Detector, dataRoot, cube, draftID string, it scanItem, job *scanJob) {
	job.mu.Lock()
	job.current = it.photo
	job.mu.Unlock()
	defer func() {
		job.mu.Lock()
		job.done++
		job.mu.Unlock()
	}()

	abs, cl, ok := resolvePhoto(dataRoot, cube, it.photo)
	if !ok {
		return
	}
	results, err := det.DetectPhoto(abs, cl)
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
	writeScannedBoxes(dataRoot, cube, draftID, it, boxes)
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
func writeScannedBoxes(dataRoot, cube, draftID string, it scanItem, boxes []Box) {
	sessionSaveMu.Lock()
	defer sessionSaveMu.Unlock()

	s, err := LoadSession(dataRoot, cube, draftID)
	if err != nil {
		logrus.WithError(err).WithField("draft", draftID).Warn("Background scan could not load session")
		return
	}
	s.DraftID = draftID
	pw := s.Players[it.player]
	if pw == nil {
		pw = &PlayerWork{}
		s.Players[it.player] = pw
	}
	if it.deck {
		if pw.DeckBoxes == nil {
			pw.DeckBoxes = map[string][]Box{}
		}
		if len(pw.DeckBoxes[it.photo]) > 0 {
			return
		}
		pw.DeckBoxes[it.photo] = boxes
	} else {
		if pw.Boxes == nil {
			pw.Boxes = map[string][]Box{}
		}
		if len(pw.Boxes[it.photo]) > 0 {
			return
		}
		pw.Boxes[it.photo] = boxes
	}
	if err := s.Save(dataRoot, cube); err != nil {
		logrus.WithError(err).WithField("draft", draftID).Warn("Background scan could not save session")
	}
}
