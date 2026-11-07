package search

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// testCards are a small card pool covering colors, types and stats.
var testCards = []types.Card{
	{Name: "Lightning Bolt", Types: []string{"Instant"}, Colors: []string{"R"}, CMC: 1, ManaCost: "{R}", OracleText: "Lightning Bolt deals 3 damage to any target."},
	{Name: "Counterspell", Types: []string{"Instant"}, Colors: []string{"U"}, CMC: 2, ManaCost: "{U}{U}", OracleText: "Counter target spell."},
	{Name: "Grizzly Bears", Types: []string{"Creature"}, SubTypes: []string{"Bear"}, Colors: []string{"G"}, CMC: 2, Power: "2", Toughness: "2"},
	{Name: "Fire // Ice", Types: []string{"Instant"}, Colors: []string{"U", "R"}, CMC: 4, Faces: []types.Card{
		{Name: "Fire", Types: []string{"Instant"}, Colors: []string{"R"}, CMC: 2},
		{Name: "Ice", Types: []string{"Instant"}, Colors: []string{"U"}, CMC: 2},
	}},
	{Name: "Sol Ring", Types: []string{"Artifact"}, CMC: 1, Tags: []string{"watch"}},
	{Name: "Tarmogoyf", Types: []string{"Creature"}, SubTypes: []string{"Lhurgoyf"}, Colors: []string{"G"}, CMC: 2, Power: "*", Toughness: "1+*"},
}

// cardCase is one card query and the card names it should match.
type cardCase struct {
	query string
	want  []string
}

// matchingNames runs a query over testCards and returns the matching names.
func matchingNames(t *testing.T, q string, target Target) []string {
	t.Helper()
	compiled, err := Compile(q, target)
	require.NoError(t, err, q)
	var names []string
	for _, c := range testCards {
		if compiled.MatchCard(c) {
			names = append(names, c.Name)
		}
	}
	return names
}

func TestCardQueries(t *testing.T) {
	cases := []cardCase{
		{"bolt", []string{"Lightning Bolt"}},
		{`"grizzly bears"`, []string{"Grizzly Bears"}},
		{`!"Fire // Ice"`, []string{"Fire // Ice"}},
		{"!fire", nil},
		{"t:creature", []string{"Grizzly Bears", "Tarmogoyf"}},
		{"-t:creature", []string{"Lightning Bolt", "Counterspell", "Fire // Ice", "Sol Ring"}},
		{"t:instant mv<=1", []string{"Lightning Bolt"}},
		{"t:instant or t:artifact", []string{"Lightning Bolt", "Counterspell", "Fire // Ice", "Sol Ring"}},
		{"-(t:instant or t:artifact)", []string{"Grizzly Bears", "Tarmogoyf"}},
		{"t:instant AND mv=2", []string{"Counterspell"}},
		{"cmc>2", []string{"Fire // Ice"}},
		{"pow>=2", []string{"Grizzly Bears"}},
		{"st:bear", []string{"Grizzly Bears"}},
		{"t:lhur*", []string{"Tarmogoyf"}},
		{`o:"counter target"`, []string{"Counterspell"}},
		{`o:"~ deals 3"`, []string{"Lightning Bolt"}},
		{"m:{U}{U}", []string{"Counterspell"}},
		{"cctag:watch", []string{"Sol Ring"}},
		{"cctag!=watch", []string{"Lightning Bolt", "Counterspell", "Grizzly Bears", "Fire // Ice", "Tarmogoyf"}},
		{"face:(t:instant mv<3)", []string{"Lightning Bolt", "Counterspell", "Fire // Ice"}},
		{"t:instant mv<3", []string{"Lightning Bolt", "Counterspell"}},
	}
	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			assert.Equal(t, tc.want, matchingNames(t, tc.query, TargetRules))
		})
	}
}

func TestColorQueries(t *testing.T) {
	cases := []cardCase{
		{"c:r", []string{"Lightning Bolt", "Fire // Ice"}},
		{"c:ur", []string{"Fire // Ice"}},
		{"c=r", []string{"Lightning Bolt"}},
		{"c!=r", []string{"Counterspell", "Grizzly Bears", "Fire // Ice", "Sol Ring", "Tarmogoyf"}},
		{"c<=ur", []string{"Lightning Bolt", "Counterspell", "Fire // Ice", "Sol Ring"}},
		{"c<ur", []string{"Lightning Bolt", "Counterspell", "Sol Ring"}},
		{"c>u", []string{"Fire // Ice"}},
		{"c:m", []string{"Fire // Ice"}},
		{"c:c", []string{"Sol Ring"}},
		{"color:green", []string{"Grizzly Bears", "Tarmogoyf"}},
	}
	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			assert.Equal(t, tc.want, matchingNames(t, tc.query, TargetRules))
		})
	}
}

// errorCase is a query that should fail to compile, with part of the
// message it should give.
type errorCase struct {
	query  string
	target Target
	want   string
}

func TestCompileErrors(t *testing.T) {
	cases := []errorCase{
		{"foo:bar", TargetRules, "unknown keyword foo:"},
		{"!t:creature", TargetRules, "use - to negate"},
		{"mv<two", TargetRules, "needs a number"},
		{"c:xyz", TargetRules, "wubrg"},
		{"is:dragon", TargetRules, "takes one of"},
		{"(t:creature", TargetRules, "missing )"},
		{"t:creature)", TargetRules, "unmatched )"},
		{`o:"draw`, TargetRules, "unclosed quote"},
		{"o:", TargetRules, "needs a value"},
		{"t<creature", TargetRules, "doesn't take <"},
		{"games>3", TargetRules, "Cards page"},
		{"games>3", TargetDecks, "Cards page"},
		{"arch:aggro", TargetCards, "deck search"},
	}
	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			_, err := Compile(tc.query, tc.target)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.want)
		})
	}
}

func TestEmptyQueryMatchesAll(t *testing.T) {
	q, err := Compile("   ", TargetRules)
	require.NoError(t, err)
	assert.True(t, q.Empty())
	assert.True(t, q.MatchCard(testCards[0]))
}

func TestIsRoles(t *testing.T) {
	removal := types.Card{Name: "Doom Blade", OracleTags: []string{"removal"}}
	counter := types.Card{Name: "Mana Leak", OracleTags: []string{"counterspell"}}
	bear := types.Card{Name: "Grizzly Bears", Types: []string{"Creature"}}

	q := MustCompile("is:interaction", TargetRules)
	assert.True(t, q.MatchCard(removal))
	assert.True(t, q.MatchCard(counter))
	assert.False(t, q.MatchCard(bear))
}

func TestStatKeywords(t *testing.T) {
	bolt := Card{Card: testCards[0], Stats: &CardStats{Games: 12, Mainboard: 5, Players: 3, Popularity: "popular"}}
	bears := Card{Card: testCards[2], Stats: &CardStats{Games: 2, Popularity: "niche"}}

	q := MustCompile("games>10 pop:popular", TargetCards)
	assert.True(t, q.MatchCardStats(bolt))
	assert.False(t, q.MatchCardStats(bears))

	// Without stats, a stat keyword never matches.
	assert.False(t, q.MatchCard(testCards[0]))
}

func TestPartsAndString(t *testing.T) {
	q := MustCompile(`(t:enchantment OR t:artifact) -t:creature o:"draw a card"`, TargetRules)
	var texts []string
	for _, p := range q.Parts() {
		texts = append(texts, p.String())
	}
	assert.Equal(t, []string{"(t:enchantment or t:artifact)", "-t:creature", `o:"draw a card"`}, texts)
}

// fakeDeck is a deck for deck query tests.
type fakeDeck struct {
	player string
	labels []string
	size   int
	main   []types.Card
	side   []types.Card
	colors string
	events []string
}

func (d fakeDeck) GetPlayer() string {
	return d.player
}

func (d fakeDeck) GetLabels() []string {
	return d.labels
}

func (d fakeDeck) GetDraftSize() int {
	return d.size
}

func (d fakeDeck) GetMainboard() []types.Card {
	return d.main
}

func (d fakeDeck) GetSideboard() []types.Card {
	return d.side
}

func (d fakeDeck) GetPool() []types.Card {
	return append(slices.Clone(d.main), d.side...)
}

func (d fakeDeck) GetColors() types.ColorIdentity {
	return types.NewColorIdentityFromString(d.colors)
}

func (d fakeDeck) GetEventTerms() []string {
	return d.events
}

func (d fakeDeck) GetDraftID() int {
	return 1
}

// cardNamed finds a test card by name.
func cardNamed(name string) types.Card {
	i := slices.IndexFunc(testCards, func(c types.Card) bool { return c.Name == name })
	return testCards[i]
}

// testDeck is a mono-red-splash-blue aggro deck with a cheap instant and a
// creature, but no cheap creature.
var testDeck = fakeDeck{
	player: "Joan Jett",
	labels: []string{"aggro", "burn"},
	size:   8,
	main:   []types.Card{cardNamed("Lightning Bolt"), cardNamed("Fire // Ice"), {Name: "Big Guy", Types: []string{"Creature"}, CMC: 5}},
	side:   []types.Card{cardNamed("Counterspell")},
	colors: "UR",
	events: []string{"ccc2025", "Cube Con"},
}

// deckCase is a deck query and whether testDeck matches it.
type deckCase struct {
	query string
	want  bool
}

func TestDeckQueries(t *testing.T) {
	cases := []deckCase{
		{"arch:aggro", true},
		{"arch:control", false},
		{"arch!=control", true},
		{`player:"Joan Jett"`, true},
		{"player:joan", false},
		{"joan", true},
		{"burn", true},
		{"cubecon", false},
		{"event:ccc", true},
		{"dc=ur", true},
		{"dc:u", true},
		{"dc:g", false},
		{"draftsize>=8", true},
		{"draftsize>8", false},
		{"bolt", true},
		{"counterspell", false},
		{"t:creature mv<2", true},
		{"(t:creature mv<2)", false},
		{"(t:instant mv<2)", true},
		{"-t:artifact", true},
		{"-t:creature", false},
		{"arch:aggro (t:creature or t:artifact)", true},
		{"arch:control or bolt", true},
	}
	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			q := MustCompile(tc.query, TargetDecks)
			assert.Equal(t, tc.want, q.MatchDeck(testDeck, DeckOptions{}))
		})
	}
}

func TestDeckBoard(t *testing.T) {
	q := MustCompile("counterspell", TargetDecks)
	assert.False(t, q.MatchDeck(testDeck, DeckOptions{}))
	assert.True(t, q.MatchDeck(testDeck, DeckOptions{Board: "Sideboard"}))
}

func TestDeckPackages(t *testing.T) {
	burn := design.PackageCards{Name: "Burn"}
	q := MustCompile("package:burn", TargetDecks)
	assert.True(t, q.UsesPackages())
	assert.False(t, MustCompile("arch:aggro", TargetDecks).UsesPackages())

	// No resolved packages means no deck builds one.
	assert.False(t, q.MatchDeck(testDeck, DeckOptions{Packages: []design.PackageCards{burn}}))
	assert.True(t, MustCompile("-package:", TargetDecks).MatchDeck(testDeck, DeckOptions{}))
}
