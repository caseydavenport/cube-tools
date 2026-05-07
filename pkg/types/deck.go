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
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	d := NewDeck()
	if err := json.Unmarshal(contents, d); err != nil {
		return nil, err
	}

	// Backwards-compat: older deck files had top-level "wins" / "losses" game
	// counts without any per-opponent match data. Synthesize a single empty-opponent
	// match so the counts survive into the new nested structure.
	if len(d.Matches) == 0 {
		var legacy struct {
			Wins   *int `json:"wins"`
			Losses *int `json:"losses"`
		}
		if err := json.Unmarshal(contents, &legacy); err == nil && (legacy.Wins != nil || legacy.Losses != nil) {
			w, l := 0, 0
			if legacy.Wins != nil {
				w = *legacy.Wins
			}
			if legacy.Losses != nil {
				l = *legacy.Losses
			}
			d.Matches = []Match{{Wins: w, Losses: l}}
		}
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

// DraftMetadata is per-draft metadata stored once at <draftDir>/metadata.json.
// It avoids duplicating identical fields across every deck file in the draft.
type DraftMetadata struct {
	EventName        string `json:"event_name,omitempty"`
	EventDescription string `json:"event_description,omitempty"`
}

// DraftMetadataFilename is the filename used for the per-draft metadata file.
const DraftMetadataFilename = "metadata.json"

// LoadDraftMetadata reads metadata.json from a draft directory. Returns a
// zero-valued DraftMetadata (and no error) if the file does not exist.
func LoadDraftMetadata(dir string) (*DraftMetadata, error) {
	path := filepath.Join(dir, DraftMetadataFilename)
	bs, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &DraftMetadata{}, nil
		}
		return nil, err
	}
	m := &DraftMetadata{}
	if err := json.Unmarshal(bs, m); err != nil {
		return nil, err
	}
	return m, nil
}

// Save writes metadata.json into the given draft directory.
func (m *DraftMetadata) Save(dir string) error {
	bs, err := json.MarshalIndent(m, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, DraftMetadataFilename), bs, 0644)
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

	// Matches played with this deck.
	Matches []Match `json:"matches"`

	// DeckImage is a path to an image of the deck, relative to the deck file.
	DeckImage string `json:"deck_image,omitempty"`

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

	// The winner of the match. Usually d.Player or m.Opponent.
	// If empty, the match is a draw.
	Winner string `json:"winner,omitempty"`
}

type Game struct {
	// Opponent is redundant if nested, but kept for compatibility/standalone use.
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
	for _, m := range d.Matches {
		if m.Opponent == opponent {
			games = append(games, m.Games...)
		}
	}
	return games
}

// RemoveGamesForOpponent removes all games against the given opponent from the deck.
func (d *Deck) RemoveGamesForOpponent(opponent string) {
	for i := range d.Matches {
		if d.Matches[i].Opponent == opponent {
			d.Matches[i].Games = nil
			d.Matches[i].Wins = 0
			d.Matches[i].Losses = 0
			d.Matches[i].Draws = 0
		}
	}
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

	// Find the match for this opponent.
	found := false
	for i := range d.Matches {
		if d.Matches[i].Opponent == opponent {
			d.Matches[i].Games = append(d.Matches[i].Games, g)
			if g.Winner == d.Player {
				d.Matches[i].Wins++
			} else if g.Winner == "" || g.Tie {
				d.Matches[i].Draws++
			} else {
				d.Matches[i].Losses++
			}
			found = true
			break
		}
	}

	if !found {
		m := Match{Opponent: opponent, Games: []Game{g}}
		if g.Winner == d.Player {
			m.Wins++
		} else if g.Winner == "" || g.Tie {
			m.Draws++
		} else {
			m.Losses++
		}
		d.Matches = append(d.Matches, m)
	}

	// Sort the matches by opponent.
	sort.Slice(d.Matches, func(i, j int) bool {
		return d.Matches[i].Opponent < d.Matches[j].Opponent
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
	wins := 0
	for _, m := range d.Matches {
		wins += m.Wins
	}
	return wins
}

func (d *Deck) GameLosses() int {
	losses := 0
	for _, m := range d.Matches {
		losses += m.Losses
	}
	return losses
}

func (d *Deck) GameDraws() int {
	draws := 0
	for _, m := range d.Matches {
		draws += m.Draws
	}
	return draws
}

func (d *Deck) MatchWins() int {
	wins := 0
	for _, m := range d.Matches {
		if m.Winner == d.Player {
			wins++
		} else if m.Winner == "" && m.Wins > m.Losses {
			wins++
		}
	}
	return wins
}

func (d *Deck) MatchLosses() int {
	losses := 0
	for _, m := range d.Matches {
		if m.Winner != d.Player && m.Winner != "" {
			losses++
		} else if m.Winner == "" && m.Losses > m.Wins {
			losses++
		}
	}
	return losses
}

func (d *Deck) MatchDraws() int {
	draws := 0
	for _, m := range d.Matches {
		if m.Winner == "" && m.Wins == m.Losses {
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

// PrimaryColorPair returns the deck's two primary colors if the deck has 3+ colors
// but appears to be a two-color deck with splash(es). A color is considered a splash
// if it represents less than 25% of the deck's non-land colored cards.
// Returns nil if the deck has fewer than 3 colors or is a balanced multi-color deck.
func (d *Deck) PrimaryColorPair() []string {
	colors := d.GetColors()
	if len(colors) < 3 {
		return nil
	}

	// Count non-land, non-hybrid cards per color.
	colorCounts := make(map[string]int)
	total := 0
	for _, card := range d.Mainboard {
		if card.IsLand() || card.IsHybrid() {
			continue
		}
		for _, c := range card.Colors {
			if colors[c] {
				colorCounts[c]++
				total++
			}
		}
	}
	if total == 0 {
		return nil
	}

	// Sort colors by card count descending.
	sorted := make([]string, 0, len(colorCounts))
	for c := range colorCounts {
		sorted = append(sorted, c)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return colorCounts[sorted[i]] > colorCounts[sorted[j]]
	})
	if len(sorted) < 3 {
		return nil
	}

	// Check that all colors beyond the top 2 are splashes (each < 25% of total).
	for _, c := range sorted[2:] {
		if float64(colorCounts[c])/float64(total) >= 0.25 {
			return nil
		}
	}

	// Return the primary pair in WUBRG order.
	pair := []string{sorted[0], sorted[1]}
	sort.Slice(pair, func(i, j int) bool {
		return strings.Index("WUBRG", pair[i]) < strings.Index("WUBRG", pair[j])
	})
	return pair
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
