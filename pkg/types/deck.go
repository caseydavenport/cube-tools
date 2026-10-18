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

func cardNames(cs []Card) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.Name
	}
	return out
}

func hydrateNames(names []string) []Card {
	if names == nil {
		return nil
	}
	out := make([]Card, len(names))
	for i, n := range names {
		out[i] = HydrateCard(n)
	}
	return out
}

// UnmarshalJSON hydrates a Deck from its on-disk JSON form, where card
// lists are stored as []string of names. Names are resolved to Cards via
// the oracle dataset at load time.
func (d *Deck) UnmarshalJSON(data []byte) error {
	type alias Deck
	aux := &struct {
		Mainboard []string `json:"mainboard"`
		Sideboard []string `json:"sideboard"`
		Pool      []string `json:"pool,omitempty"`
		*alias
	}{
		alias: (*alias)(d),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	d.Mainboard = hydrateNames(aux.Mainboard)
	d.Sideboard = hydrateNames(aux.Sideboard)
	d.Pool = hydrateNames(aux.Pool)
	if d.Labels == nil {
		d.Labels = make([]string, 0)
	}
	return nil
}

// MarshalCompact returns the deck's on-disk JSON form: card lists as names
// rather than full Card objects, and no player names anywhere, only
// PlayerID and opponent deck IDs. Use it for writing deck files; regular
// json.Marshal emits the API form the UI consumes.
func (d *Deck) MarshalCompact() ([]byte, error) {
	aux := struct {
		Metadata       Metadata    `json:"metadata"`
		ID             int         `json:"id"`
		MacroArchetype string      `json:"macro_archetype,omitempty"`
		Labels         []string    `json:"labels"`
		PlayerID       int         `json:"player_id,omitempty"`
		Date           string      `json:"date"`
		Name           string      `json:"name,omitempty"`
		Notes          string      `json:"notes,omitempty"`
		Matches        []diskMatch `json:"matches"`
		DeckImage      string      `json:"deck_image,omitempty"`
		Mainboard      []string    `json:"mainboard"`
		Sideboard      []string    `json:"sideboard"`
		Pool           []string    `json:"pool,omitempty"`
		Colors         []string    `json:"colors,omitempty"`
	}{
		Metadata:       d.Metadata,
		ID:             d.ID,
		MacroArchetype: d.MacroArchetype,
		Labels:         d.Labels,
		PlayerID:       d.PlayerID,
		Date:           d.Date,
		Name:           d.Name,
		Notes:          d.Notes,
		Matches:        diskMatches(d.Matches),
		DeckImage:      d.DeckImage,
		Mainboard:      cardNames(d.Mainboard),
		Sideboard:      cardNames(d.Sideboard),
		Pool:           cardNames(d.Pool),
		Colors:         d.Colors,
	}
	return json.MarshalIndent(aux, "", " ")
}

// Save writes the deck to the given path in compact on-disk form.
func (d *Deck) Save(path string) error {
	bs, err := d.MarshalCompact()
	if err != nil {
		return err
	}
	return os.WriteFile(path, bs, 0o644)
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
			// Skip 0-0 stubs - they represent "no data" rather than a real match
			// and would otherwise get counted as a draw.
			if w > 0 || l > 0 {
				d.Matches = []Match{{Wins: w, Losses: l}}
			}
		}
	}
	return d, nil
}

type Metadata struct {
	// Path is the path to the deck file itself, relative to the repository root.
	Path string `json:"path,omitempty"`

	// DraftID is the ID of the draft this deck was played in, unique within its
	// cube.
	DraftID int `json:"draft_id"`

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

// DraftMetadata is a draft's identity and event details, stored once at
// <draftDir>/metadata.json. ID is unique within the cube and never reused;
// EventCode is a short tag for the event (e.g. "bcp26", "local"), and
// CubeCobraRecord is the CubeCobra record the draft was exported to, if any.
type DraftMetadata struct {
	ID               int    `json:"id"`
	Date             string `json:"date"`
	EventName        string `json:"event_name,omitempty"`
	EventCode        string `json:"event_code,omitempty"`
	EventDescription string `json:"event_description,omitempty"`
	Flight           string `json:"flight,omitempty"`
	CubeCobraRecord  string `json:"cubecobra_record,omitempty"`
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
	return os.WriteFile(filepath.Join(dir, DraftMetadataFilename), bs, 0o644)
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

	// ID identifies the deck within its draft. It is 1-based, never reused, and
	// independent of the player name, so renaming a player keeps the same deck.
	// Zero means no id has been assigned yet.
	ID int `json:"id"`

	// MacroArchetype is the deck's high-level strategy classification.
	// Expected values: "aggro", "midrange", "control", or empty.
	MacroArchetype string `json:"macro_archetype,omitempty"`

	// Tags represents metadata associated with this deck. Used for
	// secondary classifications like "ramp", "sacrifice", "tokens", etc.
	// MacroArchetype values are stored separately and should not appear here.
	Labels []string `json:"labels"`

	// PlayerID is the deck's player in the global player list; zero means an
	// anonymous seat. It is the only player reference stored on disk.
	PlayerID int `json:"player_id,omitempty"`

	// Player is the display name of whoever built the deck: the player's name,
	// an anonymous seat label, or a remote source's name. Deck files never store
	// it; players.List.ResolveDraft fills it in.
	Player string `json:"player"`
	Date   string `json:"date"`

	// Optional user-defined name for the deck.
	Name string `json:"name,omitempty"`

	// Notes is a free-form markdown write-up about the deck.
	Notes string `json:"notes,omitempty"`

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
func diskMatches(ms []Match) []diskMatch {
	if ms == nil {
		return nil
	}
	out := make([]diskMatch, len(ms))
	for i, m := range ms {
		out[i] = diskMatch{OpponentID: m.OpponentID, Round: m.Round, Wins: m.Wins, Losses: m.Losses, Draws: m.Draws}
		for _, g := range m.Games {
			out[i].Games = append(out[i].Games, diskGame{Won: g.Won, Tie: g.Tie})
		}
	}
	return out
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

func (d *Deck) Macro() string {
	// Return one of "aggro", "midrange", "control", or "".
	// Prefer the dedicated field; fall back to scanning Labels for decks
	// that haven't been backfilled yet.
	if d.MacroArchetype != "" {
		return strings.ToLower(d.MacroArchetype)
	}
	for _, label := range d.Labels {
		switch strings.ToLower(label) {
		case "aggro", "midrange", "control":
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
		if m.Winner != "" && m.Winner == d.Player {
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
		// A draw requires positive evidence that a match was actually played.
		// An empty stub match (no opponent, no games, no game counts) has
		// Winner == "" and Wins == Losses == 0 but isn't a real result.
		if m.Winner != "" {
			continue
		}
		if m.Draws > 0 {
			draws++
			continue
		}
		if m.Wins == m.Losses && (m.Wins > 0 || len(m.Games) > 0 || m.Opponent != "" || m.OpponentID != 0) {
			draws++
		}
	}
	return draws
}

func (d *Deck) Trophies() int {
	// A trophy is awarded to decks that won every match in their event with at
	// least 3 wins. The 3-win floor accepts 3-round and longer Swiss formats
	// while excluding short pods. Any draw disqualifies — a trophy means a
	// perfect record.
	if d.MatchWins() >= 3 && d.MatchLosses() == 0 && d.MatchDraws() == 0 {
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

// splashPipRatio is the fraction of the weaker main color's pips below which an
// extra color counts as a splash. A color with fewer than half the pips of the
// deck's second-most-played color is a splash.
const splashPipRatio = 0.5

// PrimaryColorPair returns the deck's two primary colors if the deck has 3+ colors
// but plays like a two-color deck with splash(es). Colors are ranked by how many
// colored mana pips they contribute across the deck's spells (hybrids count toward
// each color they name); the top two are the candidate pair. If every other color
// is a splash - fewer than half the pips of the weaker main color - we collapse to
// the pair. Otherwise it's a genuine multi-color deck and we return nil.
func (d *Deck) PrimaryColorPair() []string {
	colors := d.GetColors()
	if len(colors) < 3 {
		return nil
	}

	// Tally colored pips per color across the deck's spells, restricted to the
	// deck's colors so off-color hybrid halves don't invent a third color.
	pips := map[string]int{}
	for _, card := range d.Mainboard {
		if card.IsLand() {
			continue
		}
		for c, n := range card.ColorPips() {
			if colors[c] {
				pips[c] += n
			}
		}
	}

	// Rank the deck's colors by pips descending, breaking ties by WUBRG order
	// so the result is deterministic.
	sorted := make([]string, 0, len(colors))
	for c := range colors {
		sorted = append(sorted, c)
	}
	sort.Slice(sorted, func(i, j int) bool {
		if pips[sorted[i]] != pips[sorted[j]] {
			return pips[sorted[i]] > pips[sorted[j]]
		}
		return strings.Index("WUBRG", sorted[i]) < strings.Index("WUBRG", sorted[j])
	})

	// Every color past the top two must be a splash for the pair to hold.
	threshold := float64(pips[sorted[1]]) * splashPipRatio
	for _, c := range sorted[2:] {
		if float64(pips[c]) >= threshold {
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
