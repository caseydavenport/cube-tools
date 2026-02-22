package query

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

// --- mockDeck implements the Deck interface for testing ---

type mockDeck struct {
	player    string
	labels    []string
	draftSize int
	mainboard []types.Card
	sideboard []types.Card
	pool      []types.Card
	colors    []string
}

func (m *mockDeck) GetPlayer() string          { return m.player }
func (m *mockDeck) GetLabels() []string        { return m.labels }
func (m *mockDeck) GetDraftSize() int           { return m.draftSize }
func (m *mockDeck) GetMainboard() []types.Card { return m.mainboard }
func (m *mockDeck) GetSideboard() []types.Card { return m.sideboard }
func (m *mockDeck) GetPool() []types.Card      { return m.pool }
func (m *mockDeck) GetColors() []string        { return m.colors }

// =====================
// parseTerms
// =====================

func TestParseTerms_Simple(t *testing.T) {
	result := parseTerms("color:R cmc>3")
	assert.Equal(t, []string{"color:R", "cmc>3"}, result)
}

func TestParseTerms_QuotedValues(t *testing.T) {
	result := parseTerms(`name:"Lightning Bolt" color:R`)
	assert.Equal(t, []string{`name:"Lightning Bolt"`, "color:R"}, result)
}

func TestParseTerms_SingleTerm(t *testing.T) {
	result := parseTerms("aggro")
	assert.Equal(t, []string{"aggro"}, result)
}

func TestParseTerms_Empty(t *testing.T) {
	result := parseTerms("")
	assert.Empty(t, result)
}

func TestParseTerms_ExtraSpaces(t *testing.T) {
	result := parseTerms("  color:R   cmc>3  ")
	assert.Equal(t, []string{"color:R", "cmc>3"}, result)
}

// =====================
// isTermQuery
// =====================

func TestIsTermQuery(t *testing.T) {
	assert.True(t, isTermQuery("color:R"))
	assert.True(t, isTermQuery("cmc>3"))
	assert.True(t, isTermQuery("cmc<5"))
	assert.True(t, isTermQuery("color=RG"))
	assert.True(t, isTermQuery("color!=R"))
	assert.True(t, isTermQuery("arch:aggro"))
	assert.True(t, isTermQuery("t:Creature"))
	assert.True(t, isTermQuery("name:bolt o:damage"))
	assert.True(t, isTermQuery("player:Alice"))
	assert.True(t, isTermQuery("draftSize>4"))
	assert.False(t, isTermQuery("lightning bolt"))
	assert.False(t, isTermQuery("aggro"))
	assert.False(t, isTermQuery(""))
}

// =====================
// isDeckOnly
// =====================

func TestIsDeckOnly(t *testing.T) {
	assert.True(t, isDeckOnly("arch:aggro"))
	assert.True(t, isDeckOnly("arch!=control"))
	assert.True(t, isDeckOnly("player:Alice"))
	assert.True(t, isDeckOnly("dcolor:RG"))
	assert.True(t, isDeckOnly("draftSize>4"))
	assert.False(t, isDeckOnly("color:R"))
	assert.False(t, isDeckOnly("cmc>3"))
	assert.False(t, isDeckOnly("t:Creature"))
	assert.False(t, isDeckOnly("name:bolt"))
}

// =====================
// combineColors
// =====================

func TestCombineColors(t *testing.T) {
	assert.Equal(t, "WU", combineColors([]string{"U", "W"}))
	assert.Equal(t, "WUBRG", combineColors([]string{"G", "R", "B", "U", "W"}))
	assert.Equal(t, "R", combineColors([]string{"R"}))
	assert.Equal(t, "BR", combineColors([]string{"r", "b"})) // lowercase input
	assert.Equal(t, "", combineColors([]string{}))
}

// =====================
// colorMatches
// =====================

func TestColorMatches_Contains(t *testing.T) {
	card := types.Card{Colors: []string{"R", "W"}}
	assert.True(t, colorMatches("color:R", card))
	assert.True(t, colorMatches("color:W", card))
	assert.True(t, colorMatches("color:RW", card))
	assert.False(t, colorMatches("color:U", card))
}

func TestColorMatches_Exact(t *testing.T) {
	card := types.Card{Colors: []string{"R", "W"}}
	assert.True(t, colorMatches("color=RW", card))
	assert.True(t, colorMatches("color=WR", card)) // order doesn't matter
	assert.False(t, colorMatches("color=R", card))
}

func TestColorMatches_NotEqual(t *testing.T) {
	card := types.Card{Colors: []string{"R"}}
	assert.True(t, colorMatches("color!=U", card))
	assert.False(t, colorMatches("color!=R", card))
}

// =====================
// cmcMatches
// =====================

func TestCmcMatches(t *testing.T) {
	card := types.Card{CMC: 3}
	assert.True(t, cmcMatches("cmc<5", card))
	assert.False(t, cmcMatches("cmc<3", card))
	assert.True(t, cmcMatches("cmc>2", card))
	assert.False(t, cmcMatches("cmc>3", card))
	assert.True(t, cmcMatches("cmc=3", card))
	assert.False(t, cmcMatches("cmc=4", card))
}

// =====================
// powMatches
// =====================

func TestPowMatches(t *testing.T) {
	card := types.Card{Power: "4"}
	assert.True(t, powMatches("pow>3", card))
	assert.False(t, powMatches("pow>4", card))
	assert.True(t, powMatches("pow<5", card))
	assert.True(t, powMatches("pow=4", card))
}

func TestPowMatches_NonNumeric(t *testing.T) {
	// Cards with "*" power should not match
	card := types.Card{Power: "*"}
	assert.False(t, powMatches("pow>0", card))
}

func TestPowMatches_Empty(t *testing.T) {
	card := types.Card{Power: ""}
	assert.False(t, powMatches("pow>0", card))
}

// =====================
// deckTypeMatches
// =====================

func TestDeckTypeMatches_Found(t *testing.T) {
	d := &mockDeck{labels: []string{"aggro", "RDW"}}
	assert.True(t, deckTypeMatches("arch:aggro", d))
	assert.True(t, deckTypeMatches("arch:RDW", d))
}

func TestDeckTypeMatches_CaseInsensitive(t *testing.T) {
	d := &mockDeck{labels: []string{"Aggro"}}
	assert.True(t, deckTypeMatches("arch:aggro", d))
}

func TestDeckTypeMatches_NotFound(t *testing.T) {
	d := &mockDeck{labels: []string{"aggro"}}
	assert.False(t, deckTypeMatches("arch:control", d))
}

func TestDeckTypeMatches_NotEqual(t *testing.T) {
	d := &mockDeck{labels: []string{"aggro"}}
	assert.True(t, deckTypeMatches("arch!=control", d))
	assert.False(t, deckTypeMatches("arch!=aggro", d))
}

// =====================
// CardMatches
// =====================

func TestCardMatches_EmptyQuery(t *testing.T) {
	c := types.Card{Name: "Lightning Bolt"}
	assert.True(t, CardMatches(c, ""))
}

func TestCardMatches_FuzzyName(t *testing.T) {
	c := types.Card{Name: "Lightning Bolt", OracleText: "Deal 3 damage."}
	assert.True(t, CardMatches(c, "bolt"))
	assert.True(t, CardMatches(c, "lightning"))
	assert.False(t, CardMatches(c, "counterspell"))
}

func TestCardMatches_FuzzyOracleText(t *testing.T) {
	c := types.Card{Name: "Lightning Bolt", OracleText: "Deal 3 damage to any target."}
	assert.True(t, CardMatches(c, "damage"))
}

func TestCardMatches_NameTerm(t *testing.T) {
	c := types.Card{Name: "Lightning Bolt"}
	assert.True(t, CardMatches(c, `name:"Lightning Bolt"`))
	assert.True(t, CardMatches(c, "name:bolt"))
	assert.False(t, CardMatches(c, "name:counterspell"))
}

func TestCardMatches_TypeTerm(t *testing.T) {
	c := types.Card{Name: "Grizzly Bears", Types: []string{"Creature"}}
	assert.True(t, CardMatches(c, "t:Creature"))
	assert.True(t, CardMatches(c, "t:creature")) // case insensitive
	assert.False(t, CardMatches(c, "t:Instant"))
}

func TestCardMatches_OracleTextTerm(t *testing.T) {
	c := types.Card{Name: "Bolt", OracleText: "Deal 3 damage to any target."}
	assert.True(t, CardMatches(c, "o:damage"))
	assert.False(t, CardMatches(c, "o:counter"))
}

func TestCardMatches_ColorTerm(t *testing.T) {
	c := types.Card{Name: "Bolt", Colors: []string{"R"}}
	assert.True(t, CardMatches(c, "color:R"))
	assert.False(t, CardMatches(c, "color:U"))
}

func TestCardMatches_CmcTerm(t *testing.T) {
	c := types.Card{Name: "Bolt", CMC: 1}
	assert.True(t, CardMatches(c, "cmc<3"))
	assert.False(t, CardMatches(c, "cmc>2"))
}

func TestCardMatches_MultipleTerms(t *testing.T) {
	c := types.Card{Name: "Lightning Bolt", Colors: []string{"R"}, CMC: 1, Types: []string{"Instant"}}
	// All terms must match
	assert.True(t, CardMatches(c, "color:R cmc<3"))
	assert.False(t, CardMatches(c, "color:U cmc<3"))
}

// =====================
// DeckMatches
// =====================

func TestDeckMatches_EmptyQuery(t *testing.T) {
	d := &mockDeck{player: "Alice"}
	assert.True(t, DeckMatches(d, ""))
}

func TestDeckMatches_FuzzyPlayer(t *testing.T) {
	d := &mockDeck{player: "Alice"}
	assert.True(t, DeckMatches(d, "alice"))
	assert.True(t, DeckMatches(d, "Ali"))
	assert.False(t, DeckMatches(d, "bob"))
}

func TestDeckMatches_FuzzyLabel(t *testing.T) {
	d := &mockDeck{player: "Alice", labels: []string{"aggro", "RDW"}}
	assert.True(t, DeckMatches(d, "aggro"))
	assert.True(t, DeckMatches(d, "rdw"))
}

func TestDeckMatches_FuzzyFallsBackToCard(t *testing.T) {
	d := &mockDeck{
		player:    "Alice",
		labels:    []string{"aggro"},
		mainboard: []types.Card{{Name: "Lightning Bolt", OracleText: "damage"}},
	}
	assert.True(t, DeckMatches(d, "bolt"))
	assert.False(t, DeckMatches(d, "counterspell"))
}

func TestDeckMatches_ArchTerm(t *testing.T) {
	d := &mockDeck{player: "Alice", labels: []string{"aggro", "RDW"}}
	assert.True(t, DeckMatches(d, "arch:aggro"))
	assert.False(t, DeckMatches(d, "arch:control"))
}

func TestDeckMatches_ArchNotEqual(t *testing.T) {
	d := &mockDeck{labels: []string{"aggro"}}
	assert.True(t, DeckMatches(d, "arch!=control"))
	assert.False(t, DeckMatches(d, "arch!=aggro"))
}

func TestDeckMatches_PlayerTerm(t *testing.T) {
	d := &mockDeck{player: "Alice"}
	assert.True(t, DeckMatches(d, "player:Alice"))
	assert.True(t, DeckMatches(d, "player:alice")) // case insensitive
	assert.False(t, DeckMatches(d, "player:Bob"))
}

func TestDeckMatches_DcolorExact(t *testing.T) {
	d := &mockDeck{colors: []string{"R", "W"}}
	assert.True(t, DeckMatches(d, "dcolor=RW"))
	assert.True(t, DeckMatches(d, "dcolor=WR")) // order doesn't matter
	assert.False(t, DeckMatches(d, "dcolor=R"))
}

func TestDeckMatches_DcolorContains(t *testing.T) {
	d := &mockDeck{colors: []string{"R", "W"}}
	assert.True(t, DeckMatches(d, "dcolor:R"))
	assert.True(t, DeckMatches(d, "dcolor:W"))
	assert.False(t, DeckMatches(d, "dcolor:U"))
}

func TestDeckMatches_DcolorNotEqual(t *testing.T) {
	d := &mockDeck{colors: []string{"R", "W"}}
	assert.True(t, DeckMatches(d, "dcolor!=UB"))
	assert.False(t, DeckMatches(d, "dcolor!=RW"))
}

func TestDeckMatches_DraftSize(t *testing.T) {
	d := &mockDeck{draftSize: 6}
	assert.True(t, DeckMatches(d, "draftSize>4"))
	assert.False(t, DeckMatches(d, "draftSize>6"))
	assert.True(t, DeckMatches(d, "draftSize<8"))
	assert.True(t, DeckMatches(d, "draftSize=6"))
	assert.False(t, DeckMatches(d, "draftSize=4"))
}

func TestDeckMatches_CardTerm(t *testing.T) {
	d := &mockDeck{
		mainboard: []types.Card{
			{Name: "Lightning Bolt", Colors: []string{"R"}, CMC: 1, Types: []string{"Instant"}},
		},
	}
	assert.True(t, DeckMatches(d, "color:R"))
	assert.True(t, DeckMatches(d, "t:Instant"))
	assert.False(t, DeckMatches(d, "color:U"))
}

func TestDeckMatches_MixedDeckAndCardTerms(t *testing.T) {
	d := &mockDeck{
		labels:    []string{"aggro"},
		mainboard: []types.Card{{Name: "Lightning Bolt", Colors: []string{"R"}, CMC: 1}},
	}
	// Both deck term (arch:aggro) and card term (color:R) must match
	assert.True(t, DeckMatches(d, "arch:aggro color:R"))
	assert.False(t, DeckMatches(d, "arch:control color:R"))
	assert.False(t, DeckMatches(d, "arch:aggro color:U"))
}

func TestDeckMatches_CardInSideboard(t *testing.T) {
	d := &mockDeck{
		sideboard: []types.Card{{Name: "Negate", Colors: []string{"U"}, Types: []string{"Instant"}}},
	}
	assert.True(t, DeckMatches(d, "name:Negate"))
}

func TestDeckMatches_CardInPool(t *testing.T) {
	d := &mockDeck{
		pool: []types.Card{{Name: "Forest", Types: []string{"Basic", "Land"}}},
	}
	assert.True(t, DeckMatches(d, "t:Land"))
}
