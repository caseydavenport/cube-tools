package types

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- IsBasicLand ---

func TestIsBasicLand(t *testing.T) {
	tests := []struct {
		name string
		card Card
		want bool
	}{
		{"plains", Card{Name: "Plains", Types: []string{"Basic", "Land"}}, true},
		{"nonbasic land", Card{Name: "Steam Vents", Types: []string{"Land"}}, false},
		{"creature", Card{Name: "Grizzly Bears", Types: []string{"Creature"}}, false},
		{"snow basic", Card{Name: "Snow-Covered Island", Types: []string{"Basic", "Snow", "Land"}}, true},
		{"empty", Card{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.card.IsBasicLand())
		})
	}
}

// --- IsLand ---

func TestIsLand(t *testing.T) {
	assert.True(t, Card{Types: []string{"Land"}}.IsLand())
	assert.True(t, Card{Types: []string{"Basic", "Land"}}.IsLand())
	assert.False(t, Card{Types: []string{"Creature"}}.IsLand())
}

// --- IsCreature ---

func TestIsCreature(t *testing.T) {
	assert.True(t, Card{Types: []string{"Creature"}}.IsCreature())
	assert.True(t, Card{Types: []string{"Artifact", "Creature"}}.IsCreature())
	assert.False(t, Card{Types: []string{"Instant"}}.IsCreature())
}

// --- IsHybrid ---

func TestIsHybrid(t *testing.T) {
	assert.True(t, Card{ManaCost: "{R/W}"}.IsHybrid())
	assert.True(t, Card{ManaCost: "{2/U}{R/G}"}.IsHybrid())
	assert.False(t, Card{ManaCost: "{1}{R}{W}"}.IsHybrid())
	assert.False(t, Card{ManaCost: ""}.IsHybrid())
}

// --- ColorPips ---

func TestColorPips(t *testing.T) {
	assert.Equal(t, map[string]int{"R": 1, "W": 1}, Card{ManaCost: "{1}{R}{W}"}.ColorPips())
	assert.Equal(t, map[string]int{"R": 2}, Card{ManaCost: "{R}{R}"}.ColorPips())

	// Hybrid and Phyrexian symbols count toward every color they name.
	assert.Equal(t, map[string]int{"G": 1, "W": 1}, Card{ManaCost: "{3}{G/W}"}.ColorPips())
	assert.Equal(t, map[string]int{"U": 1}, Card{ManaCost: "{2/U}"}.ColorPips())
	assert.Equal(t, map[string]int{"B": 1}, Card{ManaCost: "{B/P}"}.ColorPips())

	// Generic, colorless, and {X} contribute nothing.
	assert.Equal(t, map[string]int{}, Card{ManaCost: "{2}{C}{X}"}.ColorPips())
	assert.Equal(t, map[string]int{}, Card{ManaCost: ""}.ColorPips())
}

// --- MatchesColor ---

func TestMatchesColor(t *testing.T) {
	bolt := Card{Colors: []string{"R"}}
	assert.True(t, bolt.MatchesColor("R"))
	assert.True(t, bolt.MatchesColor("r"))  // case insensitive
	assert.True(t, bolt.MatchesColor("RG")) // contains R
	assert.False(t, bolt.MatchesColor("U"))

	// Empty color filter matches everything
	assert.True(t, bolt.MatchesColor(""))

	// Multi-color card
	multi := Card{Colors: []string{"W", "U"}}
	assert.True(t, multi.MatchesColor("W"))
	assert.True(t, multi.MatchesColor("U"))
	assert.False(t, multi.MatchesColor("R"))

	// Colorless card: Colors is empty, should match no color filter
	// (but should still match the empty filter, which is "no filter").
	colorless := Card{Colors: []string{}}
	assert.True(t, colorless.MatchesColor(""))
	assert.False(t, colorless.MatchesColor("W"))
	assert.False(t, colorless.MatchesColor("WU"))

	// Defensive: if a card somehow has Colors=[""] (degenerate parse),
	// it should NOT match every query.
	degenerate := Card{Colors: []string{""}}
	assert.False(t, degenerate.MatchesColor("W"), "card with empty color string should not match W")
	assert.False(t, degenerate.MatchesColor("WU"), "card with empty color string should not match WU")
}

// --- FromOracle ---

func TestFromOracle(t *testing.T) {
	o := OracleCard{
		Name:          "Lightning Bolt",
		CMC:           1.0,
		TypeLine:      "Instant",
		OracleText:    "Deal 3 damage to any target.",
		Colors:        []string{"R"},
		ColorIdentity: []string{"R"},
		ManaCost:      "{R}",
		ScryfallURI:   "https://scryfall.com/card/...",
		ImageURLs:     map[string]string{"normal": "https://example.com/bolt.jpg"},
		Power:         "",
		Toughness:     "",
	}

	c := FromOracle(o)
	assert.Equal(t, "Lightning Bolt", c.Name)
	assert.Equal(t, 1, c.CMC)
	assert.Equal(t, []string{"Instant"}, c.Types)
	assert.Nil(t, c.SubTypes)
	assert.Equal(t, []string{"R"}, c.Colors)
	assert.Equal(t, []string{"R"}, c.ColorIdentity)
	assert.Equal(t, "{R}", c.ManaCost)
	assert.Equal(t, "https://example.com/bolt.jpg", c.Image)
}

func TestFromOracle_WithSubtypes(t *testing.T) {
	o := OracleCard{
		Name:     "Grizzly Bears",
		CMC:      2.0,
		TypeLine: "Creature — Bear",
		Colors:   []string{"G"},
	}

	c := FromOracle(o)
	assert.Equal(t, []string{"Creature"}, c.Types)
	assert.Equal(t, []string{"Bear"}, c.SubTypes)
	assert.Equal(t, 2, c.CMC)
}

func TestFromOracle_MultipleTypes(t *testing.T) {
	o := OracleCard{
		Name:     "Dryad Arbor",
		CMC:      0,
		TypeLine: "Land Creature — Forest Dryad",
	}

	c := FromOracle(o)
	assert.Equal(t, []string{"Land", "Creature"}, c.Types)
	assert.Equal(t, []string{"Forest", "Dryad"}, c.SubTypes)
}

// MDFCs with a Land back face should report IsLand() so deck stats that
// filter or count lands include them.
func TestFromOracle_ModalDFC_BackLandVisible(t *testing.T) {
	o := OracleCard{
		Name:     "Witch Enchanter // Witch-Blessed Meadow",
		CMC:      4.0,
		TypeLine: "Creature — Human Warlock // Land",
		CardFaces: []OracleCardFace{
			{TypeLine: "Creature — Human Warlock", ManaCost: "{3}{W}", Colors: []string{"W"}},
			{TypeLine: "Land"},
		},
	}
	c := FromOracle(o)
	assert.Contains(t, c.Types, "Creature")
	assert.Contains(t, c.Types, "Land")
	assert.True(t, c.IsLand())
	assert.True(t, c.IsCreature())
}

// Transform / MDFC / flip cards carry no top-level image; the art lives on
// each face. The front face's image should fall through so DFCs still show a
// picture.
func TestFromOracle_DFCImageFromFace(t *testing.T) {
	o := OracleCard{
		Name:     "Fable of the Mirror-Breaker // Reflection of Kiki-Rikki",
		TypeLine: "Enchantment — Saga // Enchantment Creature — Goblin",
		CardFaces: []OracleCardFace{
			{TypeLine: "Enchantment — Saga", ImageURLs: map[string]string{"normal": "https://img/front.jpg"}},
			{TypeLine: "Enchantment Creature — Goblin", ImageURLs: map[string]string{"normal": "https://img/back.jpg"}},
		},
	}
	c := FromOracle(o)
	assert.Equal(t, "https://img/front.jpg", c.Image)
}

// Transform / MDFC cards have no top-level colors. The card-face colors
// should fall through so color stats see the right identity.
func TestFromOracle_TransformColorsFromFaces(t *testing.T) {
	o := OracleCard{
		Name:     "Ulvenwald Captive // Ulvenwald Abomination",
		CMC:      2.0,
		TypeLine: "Creature — Werewolf Horror // Creature — Eldrazi Werewolf",
		// Top-level Colors deliberately empty - Scryfall does this for transform.
		CardFaces: []OracleCardFace{
			{TypeLine: "Creature — Werewolf Horror", ManaCost: "{1}{G}", Colors: []string{"G"}},
			{TypeLine: "Creature — Eldrazi Werewolf", Colors: []string{"G"}},
		},
	}
	c := FromOracle(o)
	assert.Equal(t, []string{"G"}, c.Colors)
	assert.Equal(t, "{1}{G}", c.ManaCost)
}

// Split cards should parse both halves' types and drop the "//" token.
func TestFromOracle_SplitCardNoSlashInTypes(t *testing.T) {
	o := OracleCard{
		Name:     "Fire // Ice",
		CMC:      4.0,
		TypeLine: "Instant // Instant",
		Colors:   []string{"R", "U"},
		ManaCost: "{1}{R} // {1}{U}",
		CardFaces: []OracleCardFace{
			{TypeLine: "Instant", ManaCost: "{1}{R}", Colors: []string{"R"}},
			{TypeLine: "Instant", ManaCost: "{1}{U}", Colors: []string{"U"}},
		},
	}
	c := FromOracle(o)
	assert.Equal(t, []string{"Instant"}, c.Types, "expected dedup across faces")
	assert.NotContains(t, c.Types, "//")
}

func TestCardJSONAlwaysHasLists(t *testing.T) {
	for name, card := range map[string]Card{
		"no oracle data":     HydrateCard("Ozzy's Unknown Card"),
		"oracle data, empty": FromOracle(OracleCard{Name: "Ozzy's Blank Card"}),
	} {
		b, err := json.Marshal(card)
		require.NoError(t, err, name)
		s := string(b)
		assert.Contains(t, s, `"types":[]`, name)
		assert.Contains(t, s, `"colors":[]`, name)
		assert.Contains(t, s, `"color_identity":[]`, name)
	}
}

func TestCardJSONKeepsLists(t *testing.T) {
	b, err := json.Marshal(Card{Name: "Grizzly Bears", Types: []string{"Creature"}, Colors: []string{"G"}, ColorIdentity: []string{"G"}})
	require.NoError(t, err)
	var got Card
	require.NoError(t, json.Unmarshal(b, &got))
	assert.Equal(t, []string{"Creature"}, got.Types)
	assert.Equal(t, []string{"G"}, got.Colors)
	assert.Equal(t, []string{"G"}, got.ColorIdentity)
}

func TestCardJSONEmbeddedKeepsOuterFields(t *testing.T) {
	type withStats struct {
		Card
		Players map[string]int `json:"players"`
	}
	b, err := json.Marshal(withStats{Card: Card{Name: "Grizzly Bears"}, Players: map[string]int{"Ozzy": 1}})
	require.NoError(t, err)
	assert.Contains(t, string(b), `"players":{"Ozzy":1}`)
}
