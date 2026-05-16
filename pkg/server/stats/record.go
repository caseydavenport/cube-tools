package stats

import (
	"math"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// Record aggregates game outcomes across one or more decks and produces a
// win percentage. Draws count as half a win in the rate; the raw count is
// preserved for callers that want to display it.
type Record struct {
	Wins       int     `json:"wins"`
	Losses     int     `json:"losses"`
	Draws      int     `json:"draws"`
	WinPercent float64 `json:"win_percent"`
}

func (r *Record) Add(d *storage.Deck) {
	r.Wins += d.GameWins()
	r.Losses += d.GameLosses()
	r.Draws += d.GameDraws()
}

// Finalize computes WinPercent from the accumulated counts. Call once after
// all Add calls.
func (r *Record) Finalize() {
	r.WinPercent = winPctOf(r.Wins, r.Losses, r.Draws)
}

// winPctOf computes a win percentage where draws count as half a win.
func winPctOf(wins, losses, draws int) float64 {
	total := wins + losses + draws
	if total == 0 {
		return 0
	}
	return math.Round(1000*(float64(wins)+float64(draws)/2)/float64(total)) / 10
}
