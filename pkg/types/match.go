package types

// Match is a deck's result against one opponent in one round: game counts, and
// optionally the individual games. The API form carries display names, which
// are filled in on load; the on-disk form (diskMatch) drops them.
type Match struct {
	// Opponent is the opponent's display name, filled in on load and never
	// written to disk.
	Opponent string `json:"opponent"`

	// OpponentID is the opponent deck's ID within the same draft. When set it is
	// the source of truth and Opponent is a display copy; zero means only the
	// name is known.
	OpponentID int `json:"opponent_id,omitempty"`

	// OpponentPlayerID is the opponent deck's PlayerID, filled in on load for
	// clients that group by person. Never written to disk.
	OpponentPlayerID int `json:"opponent_player_id,omitempty"`

	// Round number this match was played in (1-indexed). 0 means unknown.
	// Lets us preserve multi-round events (Swiss, brackets, rematches) where
	// the same two players meet more than once.
	Round int `json:"round,omitempty"`

	// Explicit game counts for this match.
	// Allows representing a result like 2-1 even without Game objects.
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	Draws  int `json:"draws"`

	// Optional: individual game details.
	Games []Game `json:"games,omitempty"`

	// The winner's display name, derived from the game counts on load and
	// never written to disk. Empty means a draw.
	Winner string `json:"winner,omitempty"`
}

// Game is one game of a match. Won and Tie are the stored result, from the
// deck's point of view; Opponent and Winner are display names filled in on
// load.
type Game struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
	Won      bool   `json:"won,omitempty"`
	Tie      bool   `json:"tie,omitempty"`
}

// diskMatch is a Match as stored in a deck file, with no player names.
type diskMatch struct {
	OpponentID int        `json:"opponent_id,omitempty"`
	Round      int        `json:"round,omitempty"`
	Wins       int        `json:"wins"`
	Losses     int        `json:"losses"`
	Draws      int        `json:"draws"`
	Games      []diskGame `json:"games,omitempty"`
}

// diskGame is a Game as stored in a deck file, with no player names.
type diskGame struct {
	Won bool `json:"won,omitempty"`
	Tie bool `json:"tie,omitempty"`
}

// diskMatches strips the display names from matches for writing.
func diskMatches(matches []Match) []diskMatch {
	if matches == nil {
		return nil
	}
	out := make([]diskMatch, len(matches))
	for i, match := range matches {
		out[i] = diskMatch{OpponentID: match.OpponentID, Round: match.Round, Wins: match.Wins, Losses: match.Losses, Draws: match.Draws}
		for _, game := range match.Games {
			out[i].Games = append(out[i].Games, diskGame{Won: game.Won, Tie: game.Tie})
		}
	}
	return out
}
