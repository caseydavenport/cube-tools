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

// --- IsColor ---

func TestIsColor(t *testing.T) {
	bolt := Card{Colors: []string{"R"}}
	assert.True(t, bolt.IsColor("R"))
	assert.True(t, bolt.IsColor("r"))  // case insensitive
	assert.True(t, bolt.IsColor("RG")) // contains R
	assert.False(t, bolt.IsColor("U"))

	// Empty color filter matches everything
	assert.True(t, bolt.IsColor(""))

	// Multi-color card
	multi := Card{Colors: []string{"W", "U"}}
	assert.True(t, multi.IsColor("W"))
	assert.True(t, multi.IsColor("U"))
	assert.False(t, multi.IsColor("R"))
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

// --- IsRemoval case insensitivity ---

func TestIsRemoval_CaseInsensitive(t *testing.T) {
	c := Card{OracleText: "destroy target creature. It can't be regenerated."}
	assert.True(t, c.IsRemoval())
}
