package types

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"
)

var oracleCards = map[string]OracleCard{}

func init() {
	// A missing oracle file is non-fatal so tests and fresh checkouts run
	// without it; a present-but-malformed file is still a hard error.
	if err := LoadOracleData("./data/oracle-cards.json"); err != nil && !errors.Is(err, os.ErrNotExist) {
		panic(err)
	}
	if err := LoadOracleTags("./data/oracle-tags.jsonl"); err != nil && !errors.Is(err, os.ErrNotExist) {
		panic(err)
	}
}

// LoadOracleData loads the Scryfall oracle dataset from path into the lookup
// table, replacing any previously loaded data. Tokens and art-series cards are
// skipped, and dual names (with "//") are also indexed by their front face.
func LoadOracleData(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() {
		if err := file.Close(); err != nil {
			logrus.WithError(err).WithField("path", path).Warn("closing oracle data file")
		}
	}()

	// The file is either one JSON array of cards or JSONL, one card per line.
	// The first token tells which: an array opens with '['.
	dec := json.NewDecoder(file)
	tok, err := dec.Token()
	if errors.Is(err, io.EOF) {
		return errors.New("oracle data file is empty")
	} else if err != nil {
		return err
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return err
		}
		dec = json.NewDecoder(file)
	}

	cards := map[string]OracleCard{}
	for dec.More() {
		card := OracleCard{}
		if err := dec.Decode(&card); err != nil {
			return err
		}
		if strings.Contains(card.TypeLine, "Token") {
			continue
		}
		if card.Layout == "art_series" {
			continue
		}
		cards[card.Name] = card
		if strings.Contains(card.Name, "//") {
			trimmed := strings.TrimSpace(strings.Split(card.Name, "//")[0])
			cards[trimmed] = card
		}
	}
	oracleCards = cards
	return nil
}

// oracleNameAliases maps card names as decks commonly spell them to the name
// the oracle data uses, such as a name written without its diacritics.
var oracleNameAliases = map[string]string{
	"Lorien Revealed": "Lórien Revealed",
}

// OracleCardCount returns the number of entries in the loaded oracle dataset.
// It is zero when data/oracle-cards.json is missing. init keeps that case
// non-fatal so tests can run without the file, but the server asserts on it
// at startup since deck hydration would otherwise silently produce cards with
// no metadata.
func OracleCardCount() int {
	return len(oracleCards)
}

// OracleCards returns every loaded card once, under its full name: a "//"
// card's front-face alias isn't repeated.
func OracleCards() []OracleCard {
	out := make([]OracleCard, 0, len(oracleCards))
	for name, card := range oracleCards {
		if name != card.Name {
			continue
		}
		out = append(out, card)
	}
	return out
}

// DistinctOracleCardCount returns how many distinct cards, by oracle id, the
// loaded oracle dataset holds. Front-face aliases of "//" cards count once.
func DistinctOracleCardCount() int {
	ids := map[string]bool{}
	for _, card := range oracleCards {
		ids[card.OracleID] = true
	}
	return len(ids)
}

// GetOracleData returns the oracle data for the card with the given name, or
// the zero OracleCard when the name isn't in the loaded data. A "//" card is
// found by either its full name or its front face.
func GetOracleData(name string) OracleCard {
	if alias, ok := oracleNameAliases[name]; ok {
		name = alias
	}
	return oracleCards[name]
}

// HydrateCard returns a Card built from oracle data for the given name. If
// the card isn't in the oracle dataset (custom cards, missing data), the
// returned Card carries only the name so the deck still loads.
func HydrateCard(name string) Card {
	o := GetOracleData(name)
	if o.Name == "" {
		// No oracle match, so the returned card has no types, colors, etc.
		// Log the name so we can track down decks referencing unknown cards.
		logrus.WithField("card", name).Warn("no oracle data for card name")
		return withLists(Card{Name: name})
	}
	return FromOracle(o)
}

// OracleCard is a card from Scryfall's oracle-cards bulk file, with only the
// fields this program reads. Transform and modal double-faced cards keep their
// per-face data in CardFaces; the top-level fields can be empty for them.
type OracleCard struct {
	ID            string            `json:"id"`
	OracleID      string            `json:"oracle_id"`
	Name          string            `json:"name"`
	ScryfallURI   string            `json:"scryfall_uri"`
	ImageURLs     map[string]string `json:"image_uris"`
	ManaCost      string            `json:"mana_cost"`
	CMC           float64           `json:"cmc"`
	TypeLine      string            `json:"type_line"`
	OracleText    string            `json:"oracle_text"`
	Colors        []string          `json:"colors"`
	ColorIdentity []string          `json:"color_identity"`
	Keywords      []string          `json:"keywords"`
	RelatedURLs   map[string]string `json:"related_ur_ls"`
	Layout        string            `json:"layout"`
	SetType       string            `json:"set_type"`
	Power         string            `json:"power,omitempty"`
	Toughness     string            `json:"toughness,omitempty"`
	CardFaces     []OracleCardFace  `json:"card_faces,omitempty"`
}

// OracleCardFace is one face of a multi-face OracleCard: the name, cost, text
// and art specific to that face.
type OracleCardFace struct {
	Name       string            `json:"name"`
	OracleText string            `json:"oracle_text"`
	TypeLine   string            `json:"type_line"`
	ManaCost   string            `json:"mana_cost"`
	Colors     []string          `json:"colors"`
	Power      string            `json:"power,omitempty"`
	Toughness  string            `json:"toughness,omitempty"`
	ImageURLs  map[string]string `json:"image_uris"`
}

// SearchOracleNames finds up to limit card names in the oracle data that
// contain query, ignoring case: names that start with it first, then the
// rest, each alphabetically. Split and double-faced cards come back once, by
// their full name.
func SearchOracleNames(query string, limit int) []string {
	lowerQuery := strings.ToLower(query)
	seen := map[string]bool{}
	var starts, contains []string
	for _, card := range oracleCards {
		if seen[card.Name] {
			continue
		}
		seen[card.Name] = true
		lower := strings.ToLower(card.Name)
		if strings.HasPrefix(lower, lowerQuery) {
			starts = append(starts, card.Name)
		} else if strings.Contains(lower, lowerQuery) {
			contains = append(contains, card.Name)
		}
	}
	slices.Sort(starts)
	slices.Sort(contains)

	out := []string{}
	for _, name := range slices.Concat(starts, contains) {
		if len(out) == limit {
			break
		}
		out = append(out, name)
	}
	return out
}
