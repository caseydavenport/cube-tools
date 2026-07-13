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
	assert.True(t, p.Unconditional)
	assert.Equal(t, "any creature (delve)", p.Restriction)

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
	p = classifyRemoval(removalCard("Toxic Deluge", "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn."))
	assert.False(t, p.Spot)
	p = classifyRemoval(removalCard("Diabolic Edict", "Target player sacrifices a creature."))
	assert.False(t, p.Spot)

	// Non-removal returns the zero profile.
	p = classifyRemoval(types.Card{Name: "Bear", Types: []string{"Creature"}, OracleText: "Vanilla."})
	assert.False(t, p.Spot)
}

func TestKillable(t *testing.T) {
	small := creatureInfo{name: "Elf", power: 1, toughness: 1, mv: 1, colors: []string{"G"}, known: true}
	big := creatureInfo{name: "Titan", power: 6, toughness: 6, mv: 6, colors: []string{"G"}, known: true}
	star := creatureInfo{name: "Tarmogoyf", mv: 2, colors: []string{"G"}, known: false}

	unconditional := RemovalProfile{Unconditional: true}
	assert.True(t, unconditional.killable(small))
	assert.True(t, unconditional.killable(big))
	assert.True(t, unconditional.killable(star), "unconditional removal kills even unknown-P/T creatures")

	tough2 := RemovalProfile{MaxToughness: 2}
	assert.True(t, tough2.killable(small))
	assert.False(t, tough2.killable(big))
	assert.False(t, tough2.killable(star), "can't confirm a */* body against a toughness limit")

	mv3 := RemovalProfile{MaxMV: 3}
	assert.True(t, mv3.killable(small))
	assert.False(t, mv3.killable(big))
	assert.True(t, mv3.killable(star), "MV is known even when P/T isn't")

	nonGreen := RemovalProfile{ColorExclude: "G"}
	assert.False(t, nonGreen.killable(small), "green creature excluded by nonGreen removal")
	white := creatureInfo{power: 2, toughness: 2, colors: []string{"W"}, known: true}
	assert.True(t, nonGreen.killable(white))
}

// Coverage counts scale with restrictiveness: an unconditional spell hits every
// creature; a toughness-limited one hits fewer.
func TestRemovalCoverage(t *testing.T) {
	creatures := []creatureInfo{
		{name: "a", power: 1, toughness: 1, mv: 1, known: true},
		{name: "b", power: 3, toughness: 3, mv: 3, known: true},
		{name: "c", power: 5, toughness: 5, mv: 6, known: true},
	}
	weights := map[string]int{"a": 10, "b": 5, "c": 1}
	total := 16

	uncond := buildRemovalCard(
		types.Card{Name: "Doom", CMC: 2, OracleText: "Destroy target creature."},
		classifyRemoval(removalCard("Doom", "Destroy target creature.")),
		creatures, weights, total,
	)
	assert.Equal(t, 3, uncond.Targets)
	assert.Equal(t, 100.0, uncond.PctCube)
	// Raw avg MV killed = (1+3+6)/3 = 3.33; play-weighted leans to the popular 'a'
	// (mv1): (10*1+5*3+1*6)/16 = 1.94, so weighting drops the average.
	assert.InDelta(t, 3.3, uncond.AvgMVKilled, 0.1)
	assert.InDelta(t, 1.9, uncond.PlayedAvgMVKilled, 0.1)
	assert.Equal(t, 100.0, uncond.PctPlayed)

	tough2 := buildRemovalCard(
		types.Card{Name: "Shrink", CMC: 1, OracleText: "Target creature gets -2/-2 until end of turn."},
		classifyRemoval(removalCard("Shrink", "Target creature gets -2/-2 until end of turn.")),
		creatures, weights, total,
	)
	assert.Equal(t, 1, tough2.Targets) // only creature 'a' (toughness 1)
	assert.InDelta(t, 33.3, tough2.PctCube, 0.1)
	assert.InDelta(t, 62.5, tough2.PctPlayed, 0.1) // 10/16 - 'a' is heavily played
}
