package types

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
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
	// Path is the path to the deck file itself, relative to the repository root.
	Path string `json:"path"`

	// DraftID is a unique identifier for the draft from which this deck was created.
	// Typically this is the date of the draft, plus another unique identifier in case
	// there are multiple drafts on the same day.
	DraftID string `json:"draft_id"`

	// MainboardFile is the name of the file containing the mainboard, relative to the deck file.
	MainboardFile string `json:"mainboard_file,omitempty"`

	// SideboardFile is the name of the file containing the sideboard, relative to the deck file.
	SideboardFile string `json:"sideboard_file,omitempty"`

	// CombinedFile is the name of the file containing both the mainboard and sideboard (separated by a marker),
	// relative to the deck file.
	CombinedFile string `json:"combined_file,omitempty"`

	// PoolFile is the name of the file containing the draft pool, relative to the deck file.
	// Used when the mainbord / sideboard decisions are not known.
	PoolFile string `json:"pool_file,omitempty"`
}

func (m *Metadata) GetSourceFiles() []string {
	files := make([]string, 0)
	if m.CombinedFile != "" {
		files = append(files, m.CombinedFile)
	}
	if m.MainboardFile != "" {
		files = append(files, m.MainboardFile)
	}
	if m.SideboardFile != "" {
		files = append(files, m.SideboardFile)
	}
	if m.PoolFile != "" {
		files = append(files, m.PoolFile)
	}

	return files
}

func (m *Metadata) Dir() string {
	return filepath.Dir(m.Path)
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

	// Alternative to Matches, when we don't have detailed match information.
	MatchWinsOverride   *int `json:"match_wins_override,omitempty"`
	MatchLossesOverride *int `json:"match_losses_override,omitempty"`
	MatchDrawsOverride  *int `json:"match_draws_override,omitempty"`

	// Alternative to Games, when we don't have detailed game information.
	Wins   *int `json:"wins,omitempty"`
	Losses *int `json:"losses,omitempty"`

	// Cards in the mainboard and sideboard.
	Mainboard []Card `json:"mainboard"`
	Sideboard []Card `json:"sideboard"`

	// Pool is the draft pool, if known. This is used when the mainboard / sideboard
	// decisions are not known, and is mutually exclusive with Mainboard and Sideboard.
	Pool []Card `json:"pool,omitempty"`

	// Colors is an optional list of colors for the deck. If specified, it overrides
	// the colors inferred from the cards in the mainboard. This is useful for
	// decks that don't neatly fit into the color identity of the cards, or when we only
	// have approximate information about the cards in the deck.
	Colors []string `json:"colors,omitempty"`
}

type Match struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
}

type Game struct {
	Opponent string `json:"opponent"`
	Winner   string `json:"winner"`
	Tie      bool   `json:"tie,omitempty"`
}

type Result string

const (
	ResultWin  Result = "W"
	ResultLoss Result = "L"
	ResultDraw Result = "D"
)

func (g *Game) Result() Result {
	if g.Winner == g.Opponent {
		return ResultLoss
	} else if g.Winner == "" || g.Tie {
		return ResultDraw
	}
	return ResultWin
}

func (d *Deck) AllCards() []Card {
	cards := []Card{}
	cards = append(cards, d.Mainboard...)
	cards = append(cards, d.Sideboard...)
	cards = append(cards, d.Pool...)
	return cards
}

func (d *Deck) PickCount() int {
	if len(d.Pool) > 0 {
		// If we have a pool, just return the size of the pool.
		return len(d.Pool)
	}

	// Count the number of cards in the mainboard and sideboard, excluding basic lands.
	count := 0
	for _, c := range d.Mainboard {
		if !c.IsBasicLand() {
			count++
		}
	}
	for _, c := range d.Sideboard {
		if !c.IsBasicLand() {
			count++
		}
	}
	return count
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
	g := Game{Opponent: opponent, Winner: winner}
	if winner == "" {
		g.Tie = true
	}
	d.Games = append(d.Games, g)

	// Sort the games by opponent.
	sort.Slice(d.Games, func(i, j int) bool {
		return d.Games[i].Opponent < d.Games[j].Opponent
	})
}

func (d *Deck) Macro() string {
	// Return one of "aggro", "midrange", "control", "tempo", or "".
	for _, label := range d.Labels {
		switch strings.ToLower(label) {
		case "aggro", "midrange", "control", "tempo":
			return strings.ToLower(label)
		}
	}
	return ""
}

func (d *Deck) GameWins() int {
	// Respect the legacy Wins field if it's set.
	if d.Wins != nil {
		return *d.Wins
	}

	wins := 0
	for _, g := range d.Games {
		if g.Winner == d.Player {
			wins++
		}
	}
	return wins
}

func (d *Deck) GameLosses() int {
	// Respect the legacy Losses field if it's set.
	if d.Losses != nil {
		return *d.Losses
	}

	losses := 0
	for _, g := range d.Games {
		if g.Winner != d.Player && g.Winner != "" && !g.Tie {
			losses++
		}
	}
	return losses
}

func (d *Deck) GameDraws() int {
	draws := 0
	for _, g := range d.Games {
		if g.Winner == "" || g.Tie {
			draws++
		}
	}
	return draws
}

func (d *Deck) MatchWins() int {
	if d.MatchWinsOverride != nil {
		return *d.MatchWinsOverride
	}

	wins := 0
	for _, m := range d.Matches {
		if m.Winner == d.Player {
			wins++
		}
	}
	return wins
}

func (d *Deck) MatchLosses() int {
	if d.MatchLossesOverride != nil {
		return *d.MatchLossesOverride
	}

	losses := 0
	for _, m := range d.Matches {
		if m.Winner != d.Player && m.Winner != "" {
			losses++
		}
	}
	return losses
}

func (d *Deck) MatchDraws() int {
	if d.MatchDrawsOverride != nil {
		return *d.MatchDrawsOverride
	}

	draws := 0
	for _, m := range d.Matches {
		if m.Winner == "" {
			draws++
		}
	}
	return draws
}

func (d *Deck) Trophies() int {
	// A trophy is awarded to decks with >3 match wins and no match losses.
	if d.MatchWins() >= 3 && d.MatchLosses() == 0 {
		return 1
	}
	return 0
}

func (d *Deck) LastPlace() int {
	// A last place finish is defined as a deck with 0 match wins and >=3 match losses.
	if d.MatchWins() == 0 && d.MatchLosses() >= 3 {
		return 1
	}
	return 0
}

// TopHalf returns 1 if this deck was a 2-1 or better (i.e., top half of the draft pool),
// and zero otherwise.
func (d *Deck) TopHalf() int {
	if d.MatchWins() > d.MatchLosses() {
		return 1
	}
	return 0
}

// BottomHalf returns 1 if this deck was a 1-2 or worse (i.e., bottom half of the draft pool).
func (d *Deck) BottomHalf() int {
	if d.MatchLosses() > d.MatchWins() {
		return 1
	}
	return 0
}

func (d *Deck) GetColors() map[string]bool {
	colors := make(map[string]bool)
	if len(d.Colors) > 0 {
		// If the deck has explicit colors, use those.
		for _, c := range d.Colors {
			colors[c] = true
		}
		return colors
	}

	// Otherwise, infer colors from the mainboard cards.
	for _, c := range d.Mainboard {
		// Skip hybrid cards, as they may be included for one of their
		// colors but not the other.
		if c.IsHybrid() {
			continue
		}
		for _, color := range c.Colors {
			colors[color] = true
		}
	}
	return colors
}

// ColorIdentities returns all the color identities of this deck.
// e.g., a WUG deck will return [W, U, G, WU, WG, UG, WUG]
// Note: We exclude identities with more than 3 colors for simplicity.
func (d *Deck) ColorIdentities() map[string]bool {
	deckColors := d.GetColors()
	allColors := make(map[string]bool)
	for c := range deckColors {
		allColors[c] = true

		// Dual-colors.
		for c2 := range deckColors {
			pair := combineColors([]string{c, c2})
			if c == c2 {
				continue
			}
			allColors[pair] = true

			// Trios.
			for c3 := range deckColors {
				trio := combineColors([]string{c, c2, c3})
				if c3 == c || c3 == c2 {
					continue
				}
				allColors[trio] = true
			}
		}
	}

	return allColors
}

// combineColors takes a slice of color strings (e.g., ["U", "W", "G"]) and returns
// a single string with the colors sorted by WUBRG, and concatenated (e.g., "WUG").
func combineColors(colors []string) string {
	sort.Slice(colors, func(i, j int) bool {
		order := "WUBRG"
		return strings.Index(order, colors[i]) < strings.Index(order, colors[j])
	})
	return strings.Join(colors, "")
}

// A card is castable if its colors are a subset of the deck's colors, or if it's colorless.
func (d *Deck) CanCast(c Card) bool {
	if len(c.Colors) == 0 && !slices.Contains(c.Types, "Land") {
		// Colorless cards are always castable.
		return true
	}

	// For most cards, use the card's colors to determine if it's in the deck.
	// For lands, use the color identity of the card (since lands don't have colors, but do have color identity).
	cardColors := c.Colors
	if slices.Contains(c.Types, "Land") {
		cardColors = c.ColorIdentity
	}

	deckColors := d.GetColors()
	if len(deckColors) == 0 {
		// If the deck has no colors, it can't cast any colored cards.
		return false
	}
	if len(c.ColorIdentity) == 0 {
		return true
	}
	for _, color := range cardColors {
		if !deckColors[color] {
			return false
		}
	}
	return true
}
