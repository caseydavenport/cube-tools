package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
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

// --- IsRemoval ---

func TestIsRemoval(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{"destroy creature", "Destroy target creature.", true},
		{"exile permanent", "Exile target permanent.", true},
		{"damage any target", "Lightning Bolt deals 3 damage to any target.", true},
		{"board wipe", "Destroy all creatures.", true},
		{"bounce", "Return target creature to its owner's hand.", true},
		{"fights", "Target creature you control fights target creature you don't control.", true},
		{"edict", "Target opponent sacrifices a creature.", true},
		{"no removal", "Draw two cards.", false},
		{"empty", "", false},
		{"stun counter", "When this enters the battlefield, put a stun counter on target creature.", true},
		{"tap creature", "Tap target creature. It doesn't untap during its controller's next untap step.", true},
		{"negative toughness", "Target creature gets -3/-3 until end of turn.", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsRemoval())
		})
	}
}

// --- IsCounterspell ---

func TestIsCounterspell(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{"counter spell", "Counter target spell.", true},
		{"counter creature", "Counter target creature spell.", true},
		{"exile spell", "Exile target spell.", true},
		{"remand", "Return target spell to its owner's hand.", true},
		{"draw cards", "Draw two cards.", false},
		{"empty", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsCounterspell())
		})
	}
}

// --- IsHandHate ---

func TestIsHandHate(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{"thoughtseize", "Target player reveals their hand. You choose a nonland card from it.", true},
		{"duress", "Target opponent reveals their hand. You choose a noncreature, nonland card from it.", true},
		{"discard", "Target player discards a card.", true},
		{"opponent discards", "Target opponent discards two cards.", true},
		{"each discards", "Each opponent discards a card.", true},
		{"not hand hate", "Draw a card.", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsHandHate())
		})
	}
}

// --- IsInteraction ---

func TestIsInteraction(t *testing.T) {
	// Removal counts as interaction
	assert.True(t, Card{OracleText: "Destroy target creature."}.IsInteraction())
	// Counterspell counts as interaction
	assert.True(t, Card{OracleText: "Counter target spell."}.IsInteraction())
	// Hand hate counts as interaction
	assert.True(t, Card{OracleText: "Target player discards a card."}.IsInteraction())
	// Card draw is not interaction
	assert.False(t, Card{OracleText: "Draw two cards."}.IsInteraction())
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

// --- IsRemoval case insensitivity ---

func TestIsRemoval_CaseInsensitive(t *testing.T) {
	c := Card{OracleText: "destroy target creature. It can't be regenerated."}
	assert.True(t, c.IsRemoval())
}

// Regression: "deals damage equal to" used to match any X-to-Y damage clause,
// including burn-to-face triggers like Heartfire Hero. The regex now requires
// the target to be a creature, planeswalker, or "any target".
func TestIsRemoval_DealsDamageEqualTo(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{
			name: "heartfire hero burns face",
			text: "When Heartfire Hero dies, it deals damage equal to its power to each opponent.",
			want: false,
		},
		{
			name: "fights-like to target creature",
			text: "Chainweb Aracnir deals damage equal to its power to target creature with flying.",
			want: true,
		},
		{
			name: "damage equal to X to any target",
			text: "This creature deals damage equal to the number of cards in your hand to any target.",
			want: true,
		},
		{
			name: "damage equal to to target planeswalker",
			text: "It deals damage equal to its toughness to target planeswalker.",
			want: true,
		},
		{
			name: "damage equal to to target player only",
			text: "It deals damage equal to its power to target player.",
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsRemoval())
		})
	}
}

func TestIsRemoval_RealCards(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{"swords to plowshares", "Exile target creature. Its controller gains life equal to its power.", true},
		{"path to exile", "Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.", true},
		{"doom blade", "Destroy target nonblack creature.", false}, // "Destroy target nonblack creature" doesn't match "Destroy target creature"
		{"wrath of god", "Destroy all creatures. They can't be regenerated.", true},
		{"toxic deluge", "All creatures get -X/-X until end of turn.", true},
		{"unsummon", "Return target creature to its owner's hand.", true},
		{"reckless rage", "Reckless Rage deals 4 damage to target creature you don't control and 2 damage to target creature you control.", true},
		{"lightning helix", "Lightning Helix deals 3 damage to any target and you gain 3 life.", true},
		{"diabolic edict", "Target player sacrifices a creature.", true},
		{"oblivion ring style", "When this enters, exile target nonland permanent an opponent controls.", true},
		{"counterspell", "Counter target spell.", false}, // not removal
		{"divination", "Draw two cards.", false},
		{"giant growth", "Target creature gets +3/+3 until end of turn.", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsRemoval())
		})
	}
}

func TestIsCounterspell_RealCards(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{"counterspell", "Counter target spell.", true},
		{"mana leak", "Counter target spell unless its controller pays {3}.", true},
		{"negate", "Counter target noncreature spell.", true},
		{"essence scatter", "Counter target creature spell.", true},
		{"remand", "Counter target spell. Its controller draws a card.", true},
		{"reprieve", "Return target spell to its owner's hand. Its controller scries 1.", true},
		{"spell pierce", "Counter target noncreature spell unless its controller pays {2}.", true},
		{"removal not counter", "Destroy target creature.", false},
		{"discard not counter", "Target player discards a card.", false},
		{"draw not counter", "Draw two cards.", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsCounterspell())
		})
	}
}

func TestIsHandHate_RealCards(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{"thoughtseize", "Target player reveals their hand. You choose a nonland card from it. That player discards that card.", true},
		{"inquisition of kozilek", "Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card.", true},
		{"duress", "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.", true},
		{"mind rot", "Target player discards two cards.", true},
		{"hymn to tourach", "Target opponent discards two cards at random.", true},
		{"liliana's caress style", "Each opponent discards a card.", true},
		{"wheel of fortune style", "Each player discards a card.", true}, // matches "Each player discards a card"
		{"removal not hand hate", "Destroy target creature.", false},
		{"counter not hand hate", "Counter target spell.", false},
		{"draw not hand hate", "Draw two cards.", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := Card{OracleText: tt.text}
			assert.Equal(t, tt.want, c.IsHandHate())
		})
	}
}

func TestIsInteraction_CrossCategory(t *testing.T) {
	// Cards that are clearly not interaction
	assert.False(t, Card{OracleText: "Draw two cards."}.IsInteraction())
	assert.False(t, Card{OracleText: "Target creature gets +3/+3 until end of turn."}.IsInteraction())
	assert.False(t, Card{OracleText: "Create a 2/2 white Knight creature token."}.IsInteraction())

	// Heartfire Hero is not interaction - regression check
	assert.False(t, Card{OracleText: "When Heartfire Hero dies, it deals damage equal to its power to each opponent."}.IsInteraction())
}
