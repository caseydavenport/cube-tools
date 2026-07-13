package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func removalCard(name, oracle string) types.Card {
	return types.Card{Name: name, Types: []string{"Instant"}, OracleText: oracle}
}

func TestClassifyRemoval(t *testing.T) {
	// Unconditional destroy (delve noted).
	p := classifyRemoval(removalCard("Murderous Cut", "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nDestroy target creature."))
	assert.True(t, p.Spot)
	assert.Equal(t, "destroy", p.Kind)
	assert.Equal(t, "any creature (delve)", p.Restriction)
	assert.Equal(t, 0, p.MaxToughness, "unconditional has no toughness cap")

	// Exile verb is labelled distinctly from destroy.
	p = classifyRemoval(removalCard("Path to Exile", "Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle."))
	assert.True(t, p.Spot)
	assert.Equal(t, "exile", p.Kind)
	assert.Equal(t, "any creature", p.Restriction)

	// Total power and toughness.
	p = classifyRemoval(removalCard("Cut Down", "Destroy target creature with total power and toughness 5 or less."))
	assert.True(t, p.Spot)
	assert.Equal(t, 5, p.MaxPTSum)

	// Mana value, with kicker note.
	p = classifyRemoval(removalCard("Bloodchief's Thirst", "Kicker {2}{B}\nDestroy target creature or planeswalker with mana value 2 or less. If this spell was kicked, instead destroy that permanent."))
	assert.True(t, p.Spot)
	assert.Equal(t, 2, p.MaxMV)
	assert.Contains(t, p.Restriction, "kicker")

	// -X/-X shrink caps by toughness.
	p = classifyRemoval(removalCard("Disfigure", "Target creature gets -2/-2 until end of turn."))
	assert.True(t, p.Spot)
	assert.Equal(t, "shrink", p.Kind)
	assert.Equal(t, 2, p.MaxToughness)

	// Damage caps by toughness.
	p = classifyRemoval(removalCard("Abrade", "Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact."))
	assert.True(t, p.Spot)
	assert.Equal(t, "damage", p.Kind)
	assert.Equal(t, 3, p.MaxToughness)

	// Sweeper and edict are excluded.
	assert.False(t, classifyRemoval(removalCard("Toxic Deluge", "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.")).Spot)
	assert.False(t, classifyRemoval(removalCard("Diabolic Edict", "Target player sacrifices a creature.")).Spot)

	// Graveyard-card exile (Deathrite Shaman) is not battlefield removal.
	p = classifyRemoval(types.Card{Name: "Deathrite Shaman", Types: []string{"Creature"}, OracleText: "{1}{G}, {T}: Exile target creature card from a graveyard. You gain 3 life."})
	assert.False(t, p.Spot, "exiling a creature card from a graveyard isn't removal")

	// Non-removal returns the zero profile.
	assert.False(t, classifyRemoval(types.Card{Name: "Bear", Types: []string{"Creature"}, OracleText: "Vanilla."}).Spot)
}

func TestClassifyRemoval_Override(t *testing.T) {
	// Curated profile override: Chainweb Aracnir is flying-restricted.
	p := classifyRemoval(types.Card{Name: "Chainweb Aracnir", OracleText: "When this creature enters, it deals damage equal to its power to target creature with flying an opponent controls."})
	assert.True(t, p.Spot)
	assert.True(t, p.FlyingOnly)
	assert.Equal(t, 1, p.MaxToughness)

	// Prismatic Ending resolves to a representative X.
	p = classifyRemoval(types.Card{Name: "Prismatic Ending", OracleText: "Converge — Exile target nonland permanent if its mana value is less than or equal to the number of colors of mana spent to cast this spell."})
	assert.Equal(t, representativeX, p.MaxMV)
}

func TestEffectiveCost(t *testing.T) {
	// Delve: drop the generic, assume fully delved. {4}{B} -> {B}.
	assert.Equal(t, 1, effectiveCost(types.Card{Name: "Murderous Cut", CMC: 5, ManaCost: "{4}{B}", OracleText: "Delve\nDestroy target creature."}))
	// Curated override (activated ability on a land).
	assert.Equal(t, 1, effectiveCost(types.Card{Name: "Barbarian Ring", CMC: 0, ManaCost: ""}))
	// Plain spell: printed mana value (no X guessing).
	assert.Equal(t, 2, effectiveCost(types.Card{Name: "Whatever", CMC: 2, ManaCost: "{1}{B}", OracleText: "Destroy target creature with toughness 2 or less."}))
}

func TestClassifyRemoval_ScalableX(t *testing.T) {
	// A literal X in damage stays scalable rather than being force-fit to a number.
	p := classifyRemoval(removalCard("Fireball", "Fireball deals X damage to target creature."))
	assert.True(t, p.Spot)
	assert.True(t, p.Scalable)
	assert.Equal(t, 0, p.MaxToughness)

	// Scalable cards get no fabricated coverage/efficiency.
	rc := buildRemovalCard(types.Card{Name: "Fireball", CMC: 1, ManaCost: "{X}{R}"}, p, 1, []creatureInfo{{name: "a", toughness: 1, mv: 1, known: true}}, map[string]int{"a": 1}, 1)
	assert.True(t, rc.Scalable)
	assert.Equal(t, 0, rc.Targets)
	assert.Equal(t, 0.0, rc.ReachEff)
}

func TestKillable(t *testing.T) {
	small := creatureInfo{name: "Elf", power: 1, toughness: 1, mv: 1, colors: []string{"G"}, known: true}
	big := creatureInfo{name: "Titan", power: 6, toughness: 6, mv: 6, colors: []string{"G"}, known: true}
	star := creatureInfo{name: "Tarmogoyf", mv: 2, colors: []string{"G"}, known: false}
	flier := creatureInfo{name: "Bird", power: 1, toughness: 1, mv: 1, flying: true, known: true}

	anyCreature := RemovalProfile{} // no constraints
	assert.True(t, anyCreature.killable(small))
	assert.True(t, anyCreature.killable(big))
	assert.True(t, anyCreature.killable(star), "unconditional removal kills even unknown-P/T creatures")

	tough2 := RemovalProfile{MaxToughness: 2}
	assert.True(t, tough2.killable(small))
	assert.False(t, tough2.killable(big))
	assert.False(t, tough2.killable(star), "can't confirm a */* body against a toughness limit")

	mv3 := RemovalProfile{MaxMV: 3}
	assert.True(t, mv3.killable(small))
	assert.False(t, mv3.killable(big))
	assert.True(t, mv3.killable(star), "MV is known even when P/T isn't")

	flyOnly := RemovalProfile{FlyingOnly: true}
	assert.False(t, flyOnly.killable(small))
	assert.True(t, flyOnly.killable(flier))
}

// Coverage counts scale with restrictiveness, and both efficiency metrics use the
// effective cost.
func TestRemovalCoverage(t *testing.T) {
	creatures := []creatureInfo{
		{name: "a", power: 1, toughness: 1, mv: 1, known: true},
		{name: "b", power: 3, toughness: 3, mv: 3, known: true},
		{name: "c", power: 5, toughness: 5, mv: 6, known: true},
	}
	weights := map[string]int{"a": 10, "b": 5, "c": 1}
	total := 16

	uncond := buildRemovalCard(
		types.Card{Name: "Doom", CMC: 2, ManaCost: "{1}{B}", OracleText: "Destroy target creature."},
		classifyRemoval(removalCard("Doom", "Destroy target creature.")),
		2, creatures, weights, total,
	)
	assert.Equal(t, 3, uncond.Targets)
	assert.Equal(t, 100.0, uncond.PctCube)
	assert.Equal(t, 6, uncond.MaxMVKilled)
	// Reach = ceiling (6) - cost (2) = 4; avg = (1+3+6)/3 - 2 = 1.3.
	assert.InDelta(t, 4.0, uncond.ReachEff, 0.01)
	assert.InDelta(t, 1.3, uncond.Efficiency, 0.1)

	// Glass-Casket-style MV≤3 at cost 2: reach = 3 - 2 = +1 (matches intuition),
	// average pulled down by cheap creatures.
	casket := buildRemovalCard(
		types.Card{Name: "Casket", CMC: 2, ManaCost: "{1}{W}", OracleText: "exile target creature with mana value 3 or less."},
		classifyRemoval(removalCard("Casket", "exile target creature with mana value 3 or less.")),
		2, creatures, weights, total,
	)
	assert.Equal(t, 3, casket.MaxMVKilled)
	assert.InDelta(t, 1.0, casket.ReachEff, 0.01)
	assert.Equal(t, "exile", casket.Kind)
}
