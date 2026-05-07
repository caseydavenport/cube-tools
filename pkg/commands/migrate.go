package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var MigrateResultsCmd = &cobra.Command{
	Use:   "migrate-results",
	Short: "Migrate legacy game and match data to the new nested structure",
	Run: func(cmd *cobra.Command, args []string) {
		migrateResults()
	},
}

func migrateResults() {
	// Walk the data directory and find all JSON files.
	decksByDraft := make(map[string][]*types.Deck)

	err := filepath.Walk("data", func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		if !isDeckFile(path) {
			return nil
		}

		d, err := types.LoadDeck(path)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to load deck %s", path)
			return nil
		}
		// Belt-and-braces: if the loaded file has none of the fields we'd expect
		// on a deck, skip it. Guards against unknown sidecar files getting
		// rewritten as empty Decks.
		if d.Player == "" && len(d.Matches) == 0 && len(d.Games) == 0 && len(d.Mainboard) == 0 && len(d.Pool) == 0 {
			return nil
		}
		// Set the path so we can save it later.
		d.Metadata.Path = path

		decksByDraft[d.Metadata.DraftID] = append(decksByDraft[d.Metadata.DraftID], d)
		return nil
	})

	if err != nil {
		logrus.WithError(err).Fatal("Failed to walk data directory")
	}

	for draftID, decks := range decksByDraft {
		logrus.Infof("Migrating draft %s (%d decks)...", draftID, len(decks))

		// 1. Run per-deck migration (groups games, handles overrides).
		for _, d := range decks {
			d.Migrate()
		}

		// 2. Reconstruct Rounds across the whole draft.
		reconstructRounds(decks)
	}

	// 3. Load existing per-draft metadata.json files and backfill missing fields.
	draftMeta := make(map[string]*types.DraftMetadata, len(decksByDraft))
	for did, decks := range decksByDraft {
		dir := decks[0].Metadata.Dir()
		m, err := types.LoadDraftMetadata(dir)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to load metadata for %s", dir)
			m = &types.DraftMetadata{}
		}
		draftMeta[did] = m
	}
	backfillEventMetadata(decksByDraft, draftMeta)

	// 4. Save per-draft metadata.json and per-deck files.
	for did, decks := range decksByDraft {
		dir := decks[0].Metadata.Dir()
		if err := draftMeta[did].Save(dir); err != nil {
			logrus.WithError(err).Warnf("Failed to write metadata for %s", dir)
		}
		for _, d := range decks {
			bs, err := json.MarshalIndent(d, "", " ")
			if err != nil {
				logrus.WithError(err).Warnf("Failed to marshal deck %s", d.Metadata.Path)
				continue
			}
			if err := os.WriteFile(d.Metadata.Path, bs, 0644); err != nil {
				logrus.WithError(err).Warnf("Failed to write deck %s", d.Metadata.Path)
				continue
			}
		}
	}
}

// backfillEventMetadata fills in EventName / EventDescription for drafts that
// don't already have them. Rules in priority order — first match wins:
//
//  1. Skip if EventName is already set on any deck (preserves Hedron imports).
//  2. PPT23 — date in [2023-11-01, 2024-06-30], ≥8 players, includes
//     casey + dom + greg. Numbered chronologically across matches: PPT23 1,
//     PPT23 2, ...
//  3. Southern Pacific Draft — any player is colton/joe/mehdi.
//  4. Draftmancer — draft-log.json present → "Draftmancer <type> Draft"
//     (or just "Draftmancer Draft" for type=="Draft").
//  5. Otherwise: leave empty and log the directory for explicit handling.
//
// Drafts with a _dN or _N suffix in the directory name get " #N" appended.
func backfillEventMetadata(decksByDraft map[string][]*types.Deck, draftMeta map[string]*types.DraftMetadata) {
	// First pass: identify PPT23 candidates so we can number them by date.
	type ppt23Cand struct {
		draftID string
		date    string
	}
	var ppt23 []ppt23Cand
	for did, decks := range decksByDraft {
		if draftMeta[did].EventName != "" {
			continue
		}
		if isPPT23(decks) {
			ppt23 = append(ppt23, ppt23Cand{did, decks[0].Date})
		}
	}
	sort.Slice(ppt23, func(i, j int) bool { return ppt23[i].date < ppt23[j].date })
	ppt23Number := make(map[string]int, len(ppt23))
	for i, c := range ppt23 {
		ppt23Number[c.draftID] = i + 1
	}

	// Second pass: classify and apply.
	var unmatched []string
	for did, decks := range decksByDraft {
		if draftMeta[did].EventName != "" {
			continue
		}
		name := classifyEvent(did, decks, ppt23Number)
		if name == "" {
			unmatched = append(unmatched, did)
			continue
		}
		desc := buildEventDescription(name, did, decks)
		draftMeta[did].EventName = name
		draftMeta[did].EventDescription = desc
		logrus.Infof("Backfilled %s → %q", did, name)
	}

	if len(unmatched) > 0 {
		sort.Strings(unmatched)
		logrus.Infof("Drafts left without an EventName (need explicit handling):")
		for _, did := range unmatched {
			players := playerNames(decksByDraft[did])
			logrus.Infof("  %s (%d players: %s)", did, len(players), strings.Join(players, ", "))
		}
	}
}

func isPPT23(decks []*types.Deck) bool {
	if len(decks) < 8 {
		return false
	}
	if len(decks) == 0 || decks[0].Date < "2023-11-01" || decks[0].Date > "2024-06-30" {
		return false
	}
	want := map[string]bool{"casey": false, "dom": false, "greg": false}
	for _, d := range decks {
		if _, ok := want[strings.ToLower(d.Player)]; ok {
			want[strings.ToLower(d.Player)] = true
		}
	}
	for _, found := range want {
		if !found {
			return false
		}
	}
	return true
}

func hasSouthernPacificPlayer(decks []*types.Deck) bool {
	for _, d := range decks {
		switch strings.ToLower(d.Player) {
		case "colton", "joe", "mehdi":
			return true
		}
	}
	return false
}

// sessionSuffixRE matches a trailing "_d3" or "_2" on a directory name.
var sessionSuffixRE = regexp.MustCompile(`_d?(\d+)$`)

func sessionSuffix(draftID string) string {
	m := sessionSuffixRE.FindStringSubmatch(draftID)
	if m == nil {
		return ""
	}
	return " #" + m[1]
}

// explicitEventNames maps draft directory IDs to event names provided by Casey.
var explicitEventNames = map[string]string{
	"2023-03-16":      "Maiden Lane Draft",
	"2023-04-19":      "Maiden Lane Draft",
	"2023-04-22":      "Bachelor Party Draft",
	"2023-04-24":      "Bachelor Party Draft",
	"2023-04-27":      "Grand Canyon Draft",
	"2023-05-31":      "Vallejo Draft",
	"2023-06-17":      "Wedding Draft",
	"2023-07-23":      "Vallejo Draft",
	"2023-10-15":      "Grid Draft",
	"2023-11-16":      "Grid Draft",
	"2024-06-28":      "Grid Draft",
	"2024-03-28":      "Draft at Jan's",
	"2025-05-26":      "Memorial Day Draft Boston",
	"2025-08-17":      "Golden Gate Park Cube Picnic",
	"2025-10-04_ccc1": "Cali Cube Champs #1",
	"2025-10-04_ccc2": "Cali Cube Champs #2",
	"2025-10-05_ccc3": "Cali Cube Champs #3",
	"2026-01-17":      "P1P1 LA 2025",
	"2026-01-18_d1":   "P1P1 LA 2025 #1",
	"2026-01-18_d2":   "P1P1 LA 2025 #2",
}

func classifyEvent(draftID string, decks []*types.Deck, ppt23Number map[string]int) string {
	// 1. Explicit overrides.
	if name, ok := explicitEventNames[draftID]; ok {
		return name
	}
	// 2. PPT23 (overrides Draftmancer per Casey's instructions).
	if n, ok := ppt23Number[draftID]; ok {
		return fmt.Sprintf("PPT23 %d", n)
	}
	// 3. Southern Pacific.
	if hasSouthernPacificPlayer(decks) {
		return "Southern Pacific Draft" + sessionSuffix(draftID)
	}
	// 4. Draftmancer.
	if t := draftLogType(decks[0].Metadata.Path); t != "" {
		// "Grid Draft" → "Draftmancer Grid Draft"
		// "Draft"      → "Draftmancer Draft"
		return "Draftmancer " + t + sessionSuffix(draftID)
	}
	return ""
}

// draftLogType reads draft-log.json sitting next to a deck file and returns
// its top-level "type" field, or "" if the file is missing/unreadable.
func draftLogType(deckPath string) string {
	logPath := filepath.Join(filepath.Dir(deckPath), "draft-log.json")
	bs, err := os.ReadFile(logPath)
	if err != nil {
		return ""
	}
	var log struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(bs, &log); err != nil {
		return ""
	}
	return log.Type
}

func playerNames(decks []*types.Deck) []string {
	names := make([]string, 0, len(decks))
	for _, d := range decks {
		names = append(names, d.Player)
	}
	sort.Strings(names)
	return names
}

func buildEventDescription(name, draftID string, decks []*types.Deck) string {
	players := playerNames(decks)
	date := ""
	if len(decks) > 0 {
		date = decks[0].Date
	}
	return fmt.Sprintf("%s on %s with %d players: %s. Draft ID: %s.",
		name, date, len(players), strings.Join(players, ", "), draftID)
}

// isDeckFile returns true if the file at path looks like a per-player deck file
// (as opposed to a sidecar like cube.json, cube-snapshot.json, draft-log.json,
// cube-rules.json, index.json, or a REPORT). The migrator must not load those
// as Decks — Go's JSON unmarshalling silently drops unknown fields, so saving
// them back would destroy the original contents.
func isDeckFile(path string) bool {
	switch filepath.Base(path) {
	case "index.json", "cube.json", "cube-snapshot.json", "cube-rules.json", "draft-log.json", "oracle-cards.json", types.DraftMetadataFilename:
		return false
	}
	return true
}

type matchKey struct {
	p1, p2 string
}

// reconstructRounds assigns a round number to each match in the draft.
//
// Each player plays at most one match per round, so the minimum possible round
// count equals the maximum number of matches any single player has (the max
// degree of the match graph). We try to pack into exactly that many rounds via
// backtracking; if no assignment exists, we widen by one and retry.
//
// For typical cube drafts (≤10 players, ≤15 matches) the search space is tiny
// and this terminates instantly. The previous greedy-alphabetical pass would
// inflate round counts whenever an early match consumed a slot a later match
// needed — e.g. spreading a 3-round, 6-player Swiss across 4 rounds.
func reconstructRounds(decks []*types.Deck) {
	// Build the set of "real" players (those who have a deck in this draft).
	// Anything else — typically the "Unknown Opponent" placeholder generated
	// for MatchWinsOverride — is treated as a synthetic per-occurrence node so
	// it doesn't create a high-degree super-node that inflates round count.
	knownPlayer := make(map[string]bool)
	for _, d := range decks {
		knownPlayer[d.Player] = true
	}

	// For each Match entry across all decks, compute the matchKey it belongs to.
	// We record one entry per Match (in deck-iteration order) so we can stamp
	// rounds back in the same pass without re-deriving keys.
	type matchRef struct {
		deck *types.Deck
		idx  int
		key  matchKey
	}
	refs := make([]matchRef, 0)
	matches := make(map[matchKey]bool)
	degree := make(map[string]int)

	for _, d := range decks {
		// Per-deck counter for matches against each non-player opponent, so that
		// e.g. three "Unknown Opponent" entries on the same deck become three
		// distinct synthetic edges.
		ghostIdx := make(map[string]int)
		for i, m := range d.Matches {
			var k matchKey
			if knownPlayer[m.Opponent] {
				p1, p2 := d.Player, m.Opponent
				if p1 > p2 {
					p1, p2 = p2, p1
				}
				k = matchKey{p1, p2}
			} else {
				// Synthetic opponent: scope it to this deck and this occurrence
				// so it has degree 1 in the match graph (a leaf).
				ghostIdx[m.Opponent]++
				ghost := fmt.Sprintf("__ghost__/%s/%s/%d", d.Player, m.Opponent, ghostIdx[m.Opponent])
				k = matchKey{d.Player, ghost}
			}
			refs = append(refs, matchRef{d, i, k})

			if matches[k] {
				continue
			}
			matches[k] = true
			degree[k.p1]++
			degree[k.p2]++
		}
	}
	if len(matches) == 0 {
		return
	}

	// Sort matches so the search visits the most-constrained edges first
	// (highest combined degree, then lex). This dramatically prunes the tree.
	sortedMatches := make([]matchKey, 0, len(matches))
	for m := range matches {
		sortedMatches = append(sortedMatches, m)
	}
	sort.Slice(sortedMatches, func(i, j int) bool {
		di := degree[sortedMatches[i].p1] + degree[sortedMatches[i].p2]
		dj := degree[sortedMatches[j].p1] + degree[sortedMatches[j].p2]
		if di != dj {
			return di > dj
		}
		if sortedMatches[i].p1 != sortedMatches[j].p1 {
			return sortedMatches[i].p1 < sortedMatches[j].p1
		}
		return sortedMatches[i].p2 < sortedMatches[j].p2
	})

	maxDeg := 0
	for _, d := range degree {
		if d > maxDeg {
			maxDeg = d
		}
	}

	var matchRounds map[matchKey]int
	for numRounds := maxDeg; numRounds <= len(sortedMatches); numRounds++ {
		if assigned, ok := tryAssignRounds(sortedMatches, numRounds); ok {
			matchRounds = assigned
			break
		}
	}

	for _, r := range refs {
		r.deck.Matches[r.idx].Round = matchRounds[r.key]
	}
}

// tryAssignRounds attempts to color the match graph with numRounds rounds such
// that no player has two matches in the same round. Returns the assignment if
// successful.
func tryAssignRounds(matches []matchKey, numRounds int) (map[matchKey]int, bool) {
	assigned := make(map[matchKey]int, len(matches))
	busy := make(map[string]map[int]bool)

	mark := func(p string, r int) {
		if busy[p] == nil {
			busy[p] = make(map[int]bool)
		}
		busy[p][r] = true
	}
	unmark := func(p string, r int) {
		delete(busy[p], r)
	}

	var backtrack func(idx int) bool
	backtrack = func(idx int) bool {
		if idx == len(matches) {
			return true
		}
		m := matches[idx]
		for r := 1; r <= numRounds; r++ {
			if busy[m.p1][r] || busy[m.p2][r] {
				continue
			}
			assigned[m] = r
			mark(m.p1, r)
			mark(m.p2, r)
			if backtrack(idx + 1) {
				return true
			}
			unmark(m.p1, r)
			unmark(m.p2, r)
			delete(assigned, m)
		}
		return false
	}

	if !backtrack(0) {
		return nil, false
	}
	return assigned, true
}
