package types

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type cardFlagTest struct {
	name string
	card Card
	want bool
}

func TestIsBasicLand(t *testing.T) {
	tests := []cardFlagTest{
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

func TestIsLand(t *testing.T) {
	assert.True(t, Card{Types: []string{"Land"}}.IsLand())
	assert.True(t, Card{Types: []string{"Basic", "Land"}}.IsLand())
	assert.False(t, Card{Types: []string{"Creature"}}.IsLand())
}

func TestIsCreature(t *testing.T) {
	assert.True(t, Card{Types: []string{"Creature"}}.IsCreature())
	assert.True(t, Card{Types: []string{"Artifact", "Creature"}}.IsCreature())
	assert.False(t, Card{Types: []string{"Instant"}}.IsCreature())
}

func TestIsHybrid(t *testing.T) {
	assert.True(t, Card{ManaCost: "{R/W}"}.IsHybrid())
	assert.True(t, Card{ManaCost: "{2/U}{R/G}"}.IsHybrid())
	assert.False(t, Card{ManaCost: "{1}{R}{W}"}.IsHybrid())
	assert.False(t, Card{ManaCost: ""}.IsHybrid())
}

type colorPipsTest struct {
	name     string
	manaCost string
	want     map[string]int
}

func TestColorPips(t *testing.T) {
	tests := []colorPipsTest{
		{"two colors", "{1}{R}{W}", map[string]int{
			"R": 1,
			"W": 1,
		}},
		{"repeated color", "{R}{R}", map[string]int{"R": 2}},
		{"hybrid counts toward both colors", "{3}{G/W}", map[string]int{
			"G": 1,
			"W": 1,
		}},
		{"generic-or-color hybrid counts the color", "{2/U}", map[string]int{"U": 1}},
		{"phyrexian counts the color", "{B/P}", map[string]int{"B": 1}},
		{"generic, colorless and X contribute nothing", "{2}{C}{X}", map[string]int{}},
		{"no cost", "", map[string]int{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Card{ManaCost: tt.manaCost}.ColorPips())
		})
	}
}

func TestMatchesColor(t *testing.T) {
	bolt := Card{Colors: []string{"R"}}
	assert.True(t, bolt.MatchesColor("R"))

	// The filter ignores case, and any one of its letters can match.
	assert.True(t, bolt.MatchesColor("r"))
	assert.True(t, bolt.MatchesColor("RG"))
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

func TestFromOracle_CastableFaces(t *testing.T) {
	fireIce := FromOracle(OracleCard{
		Name: "Fire // Ice", Layout: "split", CMC: 4, TypeLine: "Instant // Instant",
		CardFaces: []OracleCardFace{
			{Name: "Fire", TypeLine: "Instant", ManaCost: "{1}{R}"},
			{Name: "Ice", TypeLine: "Instant", ManaCost: "{1}{U}"},
		},
	})
	require.Len(t, fireIce.Faces, 2)
	assert.Equal(t, "Fire", fireIce.Faces[0].Name)
	assert.Equal(t, []string{"Instant"}, fireIce.Faces[0].Types)
	assert.Equal(t, 2, fireIce.Faces[0].CMC)

	mouse := FromOracle(OracleCard{
		Name: "Cheeky House-Mouse // Squeak By", Layout: "adventure", CMC: 1,
		TypeLine: "Creature — Mouse // Sorcery — Adventure",
		CardFaces: []OracleCardFace{
			{Name: "Cheeky House-Mouse", TypeLine: "Creature — Mouse", ManaCost: "{W}"},
			{Name: "Squeak By", TypeLine: "Sorcery — Adventure", ManaCost: "{W}"},
		},
	})
	require.Len(t, mouse.Faces, 2)
	assert.Equal(t, []string{"Sorcery"}, mouse.Faces[1].Types)
	assert.Equal(t, 1, mouse.Faces[1].CMC)

	delver := FromOracle(OracleCard{
		Name: "Delver of Secrets // Insectile Aberration", Layout: "transform",
		TypeLine: "Creature — Human Wizard // Creature — Human Insect",
		CardFaces: []OracleCardFace{
			{Name: "Delver of Secrets", TypeLine: "Creature — Human Wizard", ManaCost: "{U}"},
			{Name: "Insectile Aberration", TypeLine: "Creature — Human Insect"},
		},
	})
	assert.Empty(t, delver.Faces)
}

func TestManaValue(t *testing.T) {
	assert.Equal(t, 2, manaValue("{1}{R}"))
	assert.Equal(t, 0, manaValue("{X}{X}"))
	assert.Equal(t, 3, manaValue("{2/W}{G}"))
	assert.Equal(t, 2, manaValue("{G/U}{B/P}"))
	assert.Equal(t, 0, manaValue(""))
}

func TestFromOracle_FaceTextJoinsWhenTopLevelEmpty(t *testing.T) {
	card := FromOracle(OracleCard{
		Name: "Ulvenwald Captive // Ulvenwald Abomination",
		CardFaces: []OracleCardFace{
			{OracleText: "Front text.", Power: "0", Toughness: "1"},
			{OracleText: "", Power: "5", Toughness: "5"},
			{OracleText: "Back text."},
		},
	})
	assert.Equal(t, "Front text.\nBack text.", card.OracleText)
	assert.Equal(t, "0", card.Power, "the front face supplies power")
	assert.Equal(t, "1", card.Toughness, "the front face supplies toughness")
}

func TestFromOracle_TopLevelFieldsBeatFaces(t *testing.T) {
	card := FromOracle(OracleCard{
		Name:       "Fire // Ice",
		ManaCost:   "{1}{R} // {1}{U}",
		OracleText: "Top-level text.",
		Colors:     []string{"R", "U"},
		ImageURLs:  map[string]string{"normal": "https://img/top.jpg"},
		CardFaces: []OracleCardFace{
			{ManaCost: "{1}{R}", OracleText: "Face text.", Colors: []string{"R"}, ImageURLs: map[string]string{"normal": "https://img/front.jpg"}},
		},
	})
	assert.Equal(t, "{1}{R} // {1}{U}", card.ManaCost)
	assert.Equal(t, "Top-level text.", card.OracleText)
	assert.Equal(t, []string{"R", "U"}, card.Colors)
	assert.Equal(t, "https://img/top.jpg", card.Image)
}

func TestWordCount_ExcludesReminderText(t *testing.T) {
	assert.Equal(t, 3, Card{OracleText: "Flying (This creature can't be blocked except by flyers.) draws cards"}.WordCount())
	assert.Equal(t, 0, Card{}.WordCount())
}
