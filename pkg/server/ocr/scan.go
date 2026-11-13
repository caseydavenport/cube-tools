package ocr

import (
	"fmt"
	"net/http"
	"slices"
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

// scanStatus is a scan job's progress as the UI polls it.
type scanStatus struct {
	State   scanState `json:"state"`
	Total   int       `json:"total"`
	Done    int       `json:"done"`
	Current string    `json:"current,omitempty"`
	Error   string    `json:"error,omitempty"`
}

// status snapshots the job under its lock.
func (j *scanJob) status() scanStatus {
	j.mu.Lock()
	defer j.mu.Unlock()
	return scanStatus{State: j.state, Total: j.total, Done: j.done, Current: j.current, Error: j.err}
}

// scanJobs holds the live or just-finished job per draft. A finished job stays
// so the UI can read "done" after a run, and is pruned when any scan next starts.
var (
	scanJobsMu sync.Mutex
	scanJobs   = map[string]*scanJob{}
)

// scanKey identifies a draft across cubes in scanJobs.
func scanKey(cube string, draftID int) string {
	return fmt.Sprintf("%s/%d", cube, draftID)
}

// scanPhoto is one photo to detect, tagged with its player and
// whether it is a deck photo, so the boxes land in the right session map.
type scanPhoto struct {
	player string
	path   string
	deck   bool
}

// buildScanWorklist lists every pool and deck photo across all players that has
// no boxes yet. Photos already scanned or hand-corrected are skipped, so the
// scan is idempotent and never clobbers existing work.
func buildScanWorklist(draft drafts.Draft) ([]scanPhoto, error) {
	players, err := discoverPlayers(draft)
	if err != nil {
		return nil, err
	}
	session := loadSessionOrEmpty(draft)

	var photos []scanPhoto
	for _, player := range players {
		work := session.Players[player.ID]
		poolPhotos := append(slices.Clone(player.Photos.Checkin), player.Photos.Checkout...)
		for _, photo := range poolPhotos {
			if work != nil && len(work.Boxes[photo]) > 0 {
				continue
			}
			photos = append(photos, scanPhoto{player: player.ID, path: photo, deck: false})
		}
		for _, photo := range player.Photos.Deck {
			if work != nil && len(work.DeckBoxes[photo]) > 0 {
				continue
			}
			photos = append(photos, scanPhoto{player: player.ID, path: photo, deck: true})
		}
	}
	return photos, nil
}

// ScanStartHandler starts a background scan of every unscanned photo in the
// draft and returns its status. A scan already running for the draft is
// reported instead of started a second time.
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

		// Starting a second scan would race on the same session file.
		if j, ok := scanJobs[key]; ok && j.status().State == scanRunning {
			scanJobsMu.Unlock()
			writeJSON(rw, j.status())
			return
		}

		// Drop finished jobs, this draft's and others', so the map holds only
		// running scans plus the one about to start.
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

// runScan detects every photo on a pool of scanWorkers goroutines, then marks
// the job done. It runs in the background after the start request returned.
func runScan(det Detector, dataRoot, cube string, draft drafts.Draft, photos []scanPhoto, job *scanJob) {
	sleeveColor := sleeveColorFor(dataRoot, cube)
	numWorkers := min(scanWorkers, len(photos))
	queue := make(chan scanPhoto)
	var wg sync.WaitGroup
	for range numWorkers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for photo := range queue {
				scanOne(det, dataRoot, cube, draft, photo, sleeveColor, job)
			}
		}()
	}
	for _, photo := range photos {
		queue <- photo
	}
	close(queue)
	wg.Wait()

	job.mu.Lock()
	job.state = scanDone
	job.current = ""
	job.mu.Unlock()
}

// scanOne detects one photo and saves its boxes, counting the photo as done
// whether or not detection worked. A failure leaves the photo empty for the
// operator to scan by hand, and the first one is kept in the job's status.
func scanOne(det Detector, dataRoot, cube string, draft drafts.Draft, photo scanPhoto, sleeveColor string, job *scanJob) {
	job.mu.Lock()
	job.current = photo.path
	job.mu.Unlock()
	defer func() {
		job.mu.Lock()
		job.done++
		job.mu.Unlock()
	}()

	abs, cubeList, ok := resolvePhoto(dataRoot, cube, draft, photo.path)
	if !ok {
		logrus.WithFields(logrus.Fields{"draft": draft.ID, "photo": photo.path}).Warn("Background scan skipped photo with no valid path or cube list")
		return
	}
	results, err := det.DetectPhoto(abs, cubeList, sleeveColor)
	if err != nil {
		logrus.WithError(err).WithField("photo", photo.path).Warn("Background scan failed to detect photo")
		job.mu.Lock()
		if job.err == "" {
			job.err = err.Error()
		}
		job.mu.Unlock()
		return
	}
	boxes := make([]Box, 0, len(results))
	for i, result := range results {
		boxes = append(boxes, resultToBox(photo.path, i, result))
	}
	writeScannedBoxes(draft, photo, boxes)
}

// resultToBox mirrors the client's linesToBoxes so background-scanned boxes are
// identical to ones produced by the per-photo Scan button.
func resultToBox(photo string, index int, result ocrpkg.MatchResult) Box {
	line := toLineJSON(result)
	return Box{
		ID:         fmt.Sprintf("%s:%d", photo, index),
		Bbox:       line.Bbox,
		Status:     line.Band,
		Chosen:     line.Chosen,
		Candidates: line.Candidates,
	}
}

// writeScannedBoxes merges one photo's boxes into the session. It takes the same
// lock as the client autosave and re-checks that the photo is still empty, so a
// player the operator opened and started correcting mid-scan is never clobbered.
func writeScannedBoxes(draft drafts.Draft, photo scanPhoto, boxes []Box) {
	sessionSaveMu.Lock()
	defer sessionSaveMu.Unlock()

	session, err := LoadSession(draft)
	if err != nil {
		logrus.WithError(err).WithField("draft", draft.ID).Warn("Background scan could not load session")
		return
	}
	session.DraftID = draft.ID
	work := session.Players[photo.player]
	if work == nil {
		work = &PlayerWork{}
		session.Players[photo.player] = work
	}

	// Deck photos and pool photos keep their boxes in separate maps.
	boxesByPhoto := &work.Boxes
	if photo.deck {
		boxesByPhoto = &work.DeckBoxes
	}
	if *boxesByPhoto == nil {
		*boxesByPhoto = map[string][]Box{}
	}
	if len((*boxesByPhoto)[photo.path]) > 0 {
		return
	}
	(*boxesByPhoto)[photo.path] = boxes
	if err := session.Save(draft); err != nil {
		logrus.WithError(err).WithField("draft", draft.ID).Warn("Background scan could not save session")
	}
}
