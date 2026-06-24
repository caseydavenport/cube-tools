package stats

import (
	"fmt"
	"math"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// matchEloK is the per-match Elo step. It's much larger than the pick Elo's eloK
// (4.0) because there are far fewer match results than draft picks, so each result
// should move the rating more. 24 matches Cube Cobra's value.
const matchEloK = 24.0

// matchEvent is one match between two decks, resolved to both mainboards and the
// deck1 result, ready for the chronological Elo replay.
type matchEvent struct {
	date  string
	round int

	d1 []string
	d2 []string

	s1 float64
}

// MatchELOData replays every recorded match in chronological order and returns
// each card's match Elo, keyed by card name and rounded. Where the pick Elo
// (PickELOData) scores what drafters chose, this scores how the decks a card
// played in actually fared, weighted by the strength of the opposing decks. Cards
// that never appeared in a completed match are absent; treat them as the eloBase
// baseline.
func MatchELOData(decks []*storage.Deck) map[string]int {
	elo := map[string]float64{}
	get := func(name string) float64 {
		if v, ok := elo[name]; ok {
			return v
		}
		return eloBase
	}
	mean := func(names []string) float64 {
		sum := 0.0
		for _, n := range names {
			sum += get(n)
		}
		return sum / float64(len(names))
	}
	for _, ev := range buildMatchEvents(decks) {
		expected1 := 1 / (1 + math.Pow(10, (mean(ev.d2)-mean(ev.d1))/400))
		delta := matchEloK * (ev.s1 - expected1)
		for _, n := range ev.d1 {
			elo[n] = get(n) + delta
		}
		for _, n := range ev.d2 {
			elo[n] = get(n) - delta
		}
	}
	out := make(map[string]int, len(elo))
	for name, v := range elo {
		out[name] = int(math.Round(v))
	}
	return out
}

// buildMatchEvents resolves each recorded match to both decks' mainboards and
// orders them chronologically (draft date, then round). A match is stored on both
// players' decks, so it's emitted once, from whichever side is seen first; s1 is
// taken from that side's perspective.
func buildMatchEvents(decks []*storage.Deck) []matchEvent {
	idx := storage.NewOpponentIndex(decks)
	seen := map[string]bool{}
	var events []matchEvent
	for _, d := range decks {
		for _, m := range d.Matches {
			opp, ok := idx.OpponentDeck(d, m.Opponent)
			if !ok {
				continue
			}
			id := matchID(d.Metadata.DraftID, d.Player, m.Opponent, m.Round)
			if seen[id] {
				continue
			}
			seen[id] = true
			d1 := mainboardNames(d)
			d2 := mainboardNames(opp)
			if len(d1) == 0 || len(d2) == 0 {
				continue
			}
			events = append(events, matchEvent{
				date:  d.Date,
				round: m.Round,
				d1:    d1,
				d2:    d2,
				s1:    matchScore(m, d.Player),
			})
		}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].date != events[j].date {
			return events[i].date < events[j].date
		}
		return events[i].round < events[j].round
	})
	return events
}

// matchID is a canonical identifier for a match, stable across the two decks that
// recorded it. Sorting the player pair collapses both sides onto one key.
func matchID(draftID, a, b string, round int) string {
	if a > b {
		a, b = b, a
	}
	return fmt.Sprintf("%s|%d|%s|%s", draftID, round, a, b)
}

// matchScore returns the match result from player's perspective: 1 win, 0 loss,
// 0.5 draw. Falls back to the game counts when there's no explicit winner.
func matchScore(m types.Match, player string) float64 {
	switch {
	case m.Winner == player:
		return 1
	case m.Winner != "":
		return 0
	case m.Wins > m.Losses:
		return 1
	case m.Wins < m.Losses:
		return 0
	default:
		return 0.5
	}
}

// mainboardNames returns the distinct non-basic-land card names in a deck's
// mainboard. Basics carry no signal and repeat, which would both dilute the deck
// rating and apply the delta to the same card several times.
func mainboardNames(d *storage.Deck) []string {
	seen := map[string]bool{}
	var names []string
	for _, c := range d.Mainboard {
		if c.IsBasicLand() || seen[c.Name] {
			continue
		}
		seen[c.Name] = true
		names = append(names, c.Name)
	}
	return names
}
