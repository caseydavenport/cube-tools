package types

import (
	"encoding/json"
	"os"
	"slices"
	"strings"
)

// NewDeck returns an empty deck whose labels and card lists are empty, not
// nil, so it marshals them as empty arrays.
func NewDeck() *Deck {
	return &Deck{
		Labels:    make([]string, 0),
		Mainboard: make([]Card, 0),
		Sideboard: make([]Card, 0),
	}
}

// cardNames returns the name of each card, in order.
func cardNames(cards []Card) []string {
	out := make([]string, len(cards))
	for i, card := range cards {
		out[i] = card.Name
	}
	return out
}

// hydrateNames resolves each card name through the oracle data. It returns nil
// for nil names, so an absent list stays absent.
func hydrateNames(names []string) []Card {
	if names == nil {
		return nil
	}
	out := make([]Card, len(names))
	for i, name := range names {
		out[i] = HydrateCard(name)
	}
	return out
}

// UnmarshalJSON hydrates a Deck from its on-disk JSON form, where card
// lists are stored as []string of names. Names are resolved to Cards via
// the oracle dataset at load time.
func (d *Deck) UnmarshalJSON(data []byte) error {
	names := &deckNames{deckAlias: (*deckAlias)(d)}
	if err := json.Unmarshal(data, names); err != nil {
		return err
	}
	d.Mainboard = hydrateNames(names.Mainboard)
	d.Sideboard = hydrateNames(names.Sideboard)
	d.Pool = hydrateNames(names.Pool)
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
	compact := compactDeck{
		Metadata:       d.Metadata,
		ID:             d.ID,
		MacroArchetype: d.MacroArchetype,
		Labels:         d.Labels,
		PlayerID:       d.PlayerID,
		Seat:           d.Seat,
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
	return json.MarshalIndent(compact, "", " ")
}

// Save writes the deck to the given path in compact on-disk form.
func (d *Deck) Save(path string) error {
	bs, err := d.MarshalCompact()
	if err != nil {
		return err
	}
	return os.WriteFile(path, bs, 0o644)
}

// LoadDeck reads the deck file at path and hydrates its cards from the oracle
// data. A file with only top-level wins and losses, and no matches, loads with
// one opponent-less match carrying those counts.
func LoadDeck(path string) (*Deck, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	deck := NewDeck()
	if err := json.Unmarshal(contents, deck); err != nil {
		return nil, err
	}
	if len(deck.Matches) == 0 {
		if legacy := legacyMatches(contents); legacy != nil {
			deck.Matches = legacy
		}
	}
	return deck, nil
}

// legacyMatches synthesizes a single opponent-less match from the top-level
// "wins" and "losses" counts of an older deck file, so the counts survive into
// the nested match structure. It returns nil when the file has no such counts
// or they are both zero, since a 0-0 stub means "no data" and would otherwise
// count as a draw.
func legacyMatches(contents []byte) []Match {
	var legacy legacyRecord
	if err := json.Unmarshal(contents, &legacy); err != nil {
		return nil
	}

	var wins, losses int
	if legacy.Wins != nil {
		wins = *legacy.Wins
	}
	if legacy.Losses != nil {
		losses = *legacy.Losses
	}
	if wins == 0 && losses == 0 {
		return nil
	}
	return []Match{{Wins: wins, Losses: losses}}
}

// Metadata locates the files a deck was loaded from. The paths are relative,
// either to the repository root or to the deck file, as each field says.
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
	// Used when the mainboard / sideboard decisions are not known.
	PoolFile string `json:"pool_file,omitempty"`
}

// GetSourceFiles returns the names of the card list files the deck was built
// from, combined file first. Names are relative to the deck file, and unset
// ones are left out.
func (m *Metadata) GetSourceFiles() []string {
	files := make([]string, 0)
	for _, file := range []string{m.CombinedFile, m.MainboardFile, m.SideboardFile, m.PoolFile} {
		if file != "" {
			files = append(files, file)
		}
	}
	return files
}

// Deck is one player's deck in a draft: its cards, labels and match results.
// json.Marshal gives the API form the UI reads; MarshalCompact gives the
// on-disk form, which omits player names.
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

	// Labels are secondary classifications like "ramp", "sacrifice", "tokens",
	// etc. MacroArchetype values are stored separately and should not appear here.
	Labels []string `json:"labels"`

	// PlayerID is the deck's player in the global player list; zero means an
	// anonymous seat. It is the only player reference stored on disk.
	PlayerID int `json:"player_id,omitempty"`

	// Seat is the deck's seat number in its draft, from the event or import
	// (Hedron's "Player 3"), or zero when unknown. Assigning the deck to a
	// player keeps it.
	Seat int `json:"seat,omitempty"`

	// Player is the display name of whoever built the deck: the player's name,
	// an anonymous seat label, or a remote source's name. Deck files never store
	// it; players.List.ResolveDraft fills it in.
	Player string `json:"player"`

	// PlayGroup is the play group of the deck's player, or the leftover group
	// for an anonymous seat. ResolveDraft fills it in.
	PlayGroup string `json:"play_group,omitempty"`

	// Date is the date the draft was played, as the deck file records it.
	Date string `json:"date"`

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

	// Colors overrides the colors inferred from the mainboard when set. It
	// covers decks that don't fit their cards' color identity, or where only
	// approximate card information is known.
	Colors []string `json:"colors,omitempty"`
}

// SeatNumber is the deck's seat, falling back to its deck ID for a deck with
// no stored seat, so every deck in a draft has a distinct one.
func (d *Deck) SeatNumber() int {
	if d.Seat != 0 {
		return d.Seat
	}
	return d.ID
}

// AllCards returns the mainboard, sideboard and pool cards in one new slice.
func (d *Deck) AllCards() []Card {
	cards := []Card{}
	cards = append(cards, d.Mainboard...)
	cards = append(cards, d.Sideboard...)
	cards = append(cards, d.Pool...)
	return cards
}

// PickCount returns how many cards the player drafted into this deck: the
// pool's size when there is a pool, otherwise the mainboard and sideboard
// cards excluding basic lands.
func (d *Deck) PickCount() int {
	if len(d.Pool) > 0 {
		return len(d.Pool)
	}

	count := 0
	for _, card := range slices.Concat(d.Mainboard, d.Sideboard) {
		if !card.IsBasicLand() {
			count++
		}
	}
	return count
}

// Macro returns the deck's macro archetype in lowercase: "aggro", "midrange",
// "control", or "" when there is none. Decks that haven't been backfilled with
// a MacroArchetype fall back to a matching label.
func (d *Deck) Macro() string {
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

// sumMatches adds up what count reads from each of the deck's matches.
func (d *Deck) sumMatches(count func(Match) int) int {
	total := 0
	for _, match := range d.Matches {
		total += count(match)
	}
	return total
}

// GameWins returns the games won across all matches.
func (d *Deck) GameWins() int {
	return d.sumMatches(func(match Match) int { return match.Wins })
}

// GameLosses returns the games lost across all matches.
func (d *Deck) GameLosses() int {
	return d.sumMatches(func(match Match) int { return match.Losses })
}

// GameDraws returns the drawn games across all matches.
func (d *Deck) GameDraws() int {
	return d.sumMatches(func(match Match) int { return match.Draws })
}

// MatchWins returns the matches this deck won. A match with a Winner is won
// when the winner is the deck's player; one without is won when the deck took
// more games than it lost.
func (d *Deck) MatchWins() int {
	wins := 0
	for _, match := range d.Matches {
		if match.Winner != "" && match.Winner == d.Player {
			wins++
		} else if match.Winner == "" && match.Wins > match.Losses {
			wins++
		}
	}
	return wins
}

// MatchLosses returns the matches this deck lost, by the same rule MatchWins
// uses for wins.
func (d *Deck) MatchLosses() int {
	losses := 0
	for _, match := range d.Matches {
		if match.Winner != d.Player && match.Winner != "" {
			losses++
		} else if match.Winner == "" && match.Losses > match.Wins {
			losses++
		}
	}
	return losses
}

// MatchDraws returns the matches with no winner and level game counts. A match
// with no opponent, games or counts is an empty stub and doesn't count.
func (d *Deck) MatchDraws() int {
	draws := 0
	for _, match := range d.Matches {
		if match.Winner != "" {
			continue
		}
		if match.Draws > 0 {
			draws++
			continue
		}
		hasEvidence := match.Wins > 0 || len(match.Games) > 0 || match.Opponent != "" || match.OpponentID != 0
		if match.Wins == match.Losses && hasEvidence {
			draws++
		}
	}
	return draws
}

// Trophies returns 1 for a deck that won every match with at least 3 wins,
// and 0 otherwise. The 3-win floor accepts 3-round and longer Swiss formats
// while excluding short pods. A draw disqualifies, since a trophy means a
// perfect record.
func (d *Deck) Trophies() int {
	if d.MatchWins() >= 3 && d.MatchLosses() == 0 && d.MatchDraws() == 0 {
		return 1
	}
	return 0
}

// LastPlace returns 1 for a deck with no match wins and at least 3 match
// losses, and 0 otherwise.
func (d *Deck) LastPlace() int {
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

// GetColors returns the deck's colors: the explicit Colors when set, otherwise
// the union of the mainboard cards' colors, skipping hybrid cards since they
// may be played for just one of their colors.
func (d *Deck) GetColors() ColorIdentity {
	colors := make(map[string]bool)
	if len(d.Colors) > 0 {
		for _, color := range d.Colors {
			colors[color] = true
		}
		return colors
	}

	for _, card := range d.Mainboard {
		if card.IsHybrid() {
			continue
		}
		for _, color := range card.Colors {
			colors[color] = true
		}
	}
	return colors
}

// splashPipRatio is the fraction of the weaker main color's pips below which an
// extra color counts as a splash. A color with fewer than half the pips of the
// deck's second-most-played color is a splash.
const splashPipRatio = 0.5

// PrimaryColorPair returns the deck's primary color pair, if any. It returns nil for mono-color decks,
// and for decks with more than two colors that don't have a clear primary pair. Otherwise,
// it returns a ColorIdentity containing the two primary colors.
func (d *Deck) PrimaryColorPair() ColorIdentity {
	colors := d.GetColors()
	switch len(colors) {
	case 0, 1:
		// Mono-color decks have no primary pair.
		return nil
	case 2:
		// Two-color decks are their own primary pair.
		return colors
	}

	// Tally colored pips per color across the deck's spells, restricted to the
	// deck's colors so off-color hybrid halves don't invent a third color.
	numPips := map[string]int{}
	for _, card := range d.Mainboard {
		if card.IsLand() {
			continue
		}
		for color, count := range card.ColorPips() {
			if colors[color] {
				numPips[color] += count
			}
		}
	}

	// Rank the deck's colors by pips descending, breaking ties by WUBRG order
	// so the result is deterministic.
	ranked := colors.Slice()
	slices.SortStableFunc(ranked, func(a, b string) int {
		return numPips[b] - numPips[a]
	})

	// Every color past the top two must be a splash for the pair to hold.
	threshold := float64(numPips[ranked[1]]) * splashPipRatio
	for _, color := range ranked[2:] {
		if float64(numPips[color]) >= threshold {
			return nil
		}
	}

	return NewColorIdentity(ranked[0], ranked[1])
}

// CanCast reports whether the deck's colors cover the card: its colors are a
// subset of the deck's, or it is colorless. A land is judged by its color
// identity, since lands have no colors. A deck with no colors casts only
// colorless cards.
func (d *Deck) CanCast(card Card) bool {
	if len(card.Colors) == 0 && !card.IsLand() {
		return true
	}

	cardColors := card.Colors
	if card.IsLand() {
		cardColors = card.ColorIdentity
	}

	deckColors := d.GetColors()
	if len(deckColors) == 0 {
		return false
	}
	if len(card.ColorIdentity) == 0 {
		return true
	}
	for _, color := range cardColors {
		if !deckColors[color] {
			return false
		}
	}
	return true
}

// The types below mirror the deck file formats that Deck.UnmarshalJSON and
// Deck.MarshalCompact read and write.

// deckAlias has Deck's fields but none of its methods, so unmarshaling into
// it doesn't call Deck.UnmarshalJSON again.
type deckAlias Deck

// deckNames is a deck file as UnmarshalJSON reads it: Deck's fields, with the
// card lists as names. The shallower names shadow the aliased lists.
type deckNames struct {
	*deckAlias
	Mainboard []string `json:"mainboard"`
	Sideboard []string `json:"sideboard"`
	Pool      []string `json:"pool,omitempty"`
}

// compactDeck is a deck as MarshalCompact writes it: card lists as names, and
// matches without display names.
type compactDeck struct {
	Metadata       Metadata    `json:"metadata"`
	ID             int         `json:"id"`
	MacroArchetype string      `json:"macro_archetype,omitempty"`
	Labels         []string    `json:"labels"`
	PlayerID       int         `json:"player_id,omitempty"`
	Seat           int         `json:"seat,omitempty"`
	Date           string      `json:"date"`
	Name           string      `json:"name,omitempty"`
	Notes          string      `json:"notes,omitempty"`
	Matches        []diskMatch `json:"matches"`
	DeckImage      string      `json:"deck_image,omitempty"`
	Mainboard      []string    `json:"mainboard"`
	Sideboard      []string    `json:"sideboard"`
	Pool           []string    `json:"pool,omitempty"`
	Colors         []string    `json:"colors,omitempty"`
}

// legacyRecord is the top-level game counts older deck files carry in place of
// per-opponent matches. A nil count means the file has no such key.
type legacyRecord struct {
	Wins   *int `json:"wins"`
	Losses *int `json:"losses"`
}
