package types

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
)

func NewDeck() *Deck {
	return &Deck{
		Metadata:  Metadata{},
		Labels:    make([]string, 0),
		Mainboard: make([]Card, 0),
		Sideboard: make([]Card, 0),
	}
}

func LoadDeck(path string) (*Deck, error) {
	contenats, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	d := NewDeck()
	if err := json.Unmarshal(contenats, d); err != nil {
		return nil, err
	}
	return d, nil
}

type Metadata struct {
	// Path is the directory where the deck file is located.
	Path string `json:"path"`

	// DraftID is a unique identifier for the draft from which this deck was created.
	// Typically this is the date of the draft, plus another unique identifier in case
	// there are multiple drafts on the same day.
	DraftID string `json:"draft_id"`

	// SourceFile is the path to the source file from which this deck was created, relative
	// to the deck file.
	SourceFile string `json:"source_file"`
}

func (m *Metadata) GetSourceFile() string {
	return filepath.Join(filepath.Dir(m.Path), m.SourceFile)
}

type Deck struct {
	// Contains metadata about the deck file itself.
	Metadata Metadata `json:"metadata"`

	// Tags represents metadata associated with this deck. This could be
	// archetype, playstyle, etc.
	Labels []string `json:"labels"`

	// Who built the deck.
	Player string `json:"player"`
	Date   string `json:"date"`

	// Optional user-defined name for the deck.
	Name string `json:"name,omitempty"`

	// Games played with this deck.
	Games []Game `json:"games"`

	// Matches played with this deck.
	Matches []Match `json:"matches"`

	// Legacy fields.
	Wins   int `json:"wins,omitempty"`
	Losses int `json:"losses,omitempty"`

	// Cards in the mainboard.
	Mainboard []Card `json:"mainboard"`
	Sideboard []Card `json:"sideboard"`
}

type Match struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
}

type Game struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
}

// RemoveMatchesForOpponent removes all matches against the given opponent from the deck.
func (d *Deck) RemoveMatchesForOpponent(opponent string) {
	newMatches := make([]Match, 0)
	for _, m := range d.Matches {
		if m.Opponent != opponent {
			newMatches = append(newMatches, m)
		}
	}
	d.Matches = newMatches
}

// GamesForOpponent returns all games against the given opponent.
func (d *Deck) GamesForOpponent(opponent string) []Game {
	games := make([]Game, 0)
	for _, g := range d.Games {
		if g.Opponent == opponent {
			games = append(games, g)
		}
	}
	return games
}

// RemoveGamesForOpponent removes all games against the given opponent from the deck.
func (d *Deck) RemoveGamesForOpponent(opponent string) {
	newGames := make([]Game, 0)
	for _, g := range d.Games {
		if g.Opponent != opponent {
			newGames = append(newGames, g)
		}
	}
	d.Games = newGames
}

// AddMatch adds a match to the deck.
func (d *Deck) AddMatch(opponent, winner string) {
	d.Matches = append(d.Matches, Match{Opponent: opponent, Winner: winner})

	// Sort the matches by opponent.
	sort.Slice(d.Matches, func(i, j int) bool {
		return d.Matches[i].Opponent < d.Matches[j].Opponent
	})
}

// AddGame adds a game to the deck.
func (d *Deck) AddGame(opponent, winner string) {
	d.Games = append(d.Games, Game{Opponent: opponent, Winner: winner})

	// Sort the games by opponent.
	sort.Slice(d.Games, func(i, j int) bool {
		return d.Games[i].Opponent < d.Games[j].Opponent
	})
}
