package design

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// presentCase is one wire and card list for TestWirePresentIn.
type presentCase struct {
	name string
	wire WireCards
	list map[string]bool
	want bool
}

func TestWirePresentIn(t *testing.T) {
	all := set("S1", "S2", "S3", "S4", "S5", "T1", "T2", "T3", "T4", "T5")
	cases := []presentCase{
		{"2 and 3", WireCards{Sources: set("S1", "S2"), Targets: set("T1", "T2", "T3")}, all, true},
		{"3 and 2", WireCards{Sources: set("S1", "S2", "S3"), Targets: set("T1", "T2")}, all, true},
		{"1 and 5", WireCards{Sources: set("S1"), Targets: set("T1", "T2", "T3", "T4", "T5")}, all, false},
		{"2 and 2", WireCards{Sources: set("S1", "S2"), Targets: set("T1", "T2")}, all, false},
		{"pairs with itself, 3 cards", WireCards{Sources: set("S1", "S2", "S3"), Targets: set("S1", "S2", "S3")}, all, true},
		{"pairs with itself, 2 cards", WireCards{Sources: set("S1", "S2"), Targets: set("S1", "S2")}, all, false},
		{"basics side, 2 cards", WireCards{Sources: set(), SourceBasics: set("Forest"), Targets: set("T1", "T2")}, all, true},
		{"basics side, 1 card", WireCards{Sources: set(), SourceBasics: set("Forest"), Targets: set("T1")}, all, false},
		{"cards outside the list", WireCards{Sources: set("S1", "S2"), Targets: set("T1", "T2", "X1")}, all, false},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, c.wire.PresentIn(c.list), c.name)
	}
}

func TestPackagePresentIn(t *testing.T) {
	list := set("S1", "S2", "T1", "T2", "T3")
	thin := WireCards{Sources: set("S1"), Targets: set("T1")}
	full := WireCards{Sources: set("S1", "S2"), Targets: set("T1", "T2", "T3")}
	assert.True(t, PackageCards{Wires: []WireCards{thin, full}}.PresentIn(list), "any present wire is enough")
	assert.False(t, PackageCards{Wires: []WireCards{thin}}.PresentIn(list))
}

func TestRelevanceInDraft(t *testing.T) {
	var none *Relevance
	assert.True(t, none.InDraft(4), "nil relevance shows everywhere")

	r := &Relevance{Today: true, Drafts: map[int]bool{4: false}}
	assert.False(t, r.InDraft(4))
	assert.True(t, r.InDraft(9), "a draft without a verdict falls back to today")
}

func TestRelevanceInAny(t *testing.T) {
	var none *Relevance
	assert.True(t, none.InAny([]int{1}))

	r := &Relevance{Today: false, Drafts: map[int]bool{1: false, 2: true}}
	assert.True(t, r.InAny([]int{1, 2}))
	assert.False(t, r.InAny([]int{1}))
	assert.False(t, r.InAny(nil), "no drafts falls back to today")
	assert.True(t, (&Relevance{Today: true}).InAny(nil))
}

func TestBuiltIn(t *testing.T) {
	p := onePackage(set("S1", "S2"), set("T1", "T2"), 2, 1)
	deck := set("S1", "S2", "T1")
	assert.True(t, p.BuiltIn(1, deck), "nil relevance leaves BuiltBy alone")

	p.Relevance = &Relevance{Today: true, Drafts: map[int]bool{1: false}}
	assert.False(t, p.BuiltIn(1, deck), "not built in a draft where it isn't relevant")
	assert.True(t, p.BuiltIn(2, deck))
	assert.False(t, p.BuiltIn(2, set("S1")), "still needs the deck to build it")
}
