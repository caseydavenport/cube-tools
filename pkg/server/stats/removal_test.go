package stats

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// removalCard returns an instant with the rules text the limit parsing reads,
// tagged removal plus the given oracle tags. The tags are sorted, as on a
// loaded card.
func removalCard(name, oracle string, tags ...string) types.Card {
	tags = append([]string{types.RoleRemoval}, tags...)
	slices.Sort(tags)
	return types.Card{Name: name, Types: []string{"Instant"}, OracleText: oracle, OracleTags: tags}
}

// spotRemoval returns an instant tagged as spot removal for creatures, with
// kindTag saying how it removes one.
func spotRemoval(name, oracle, kindTag string) types.Card {
	return removalCard(name, oracle, tagSpotRemoval, types.RoleRemovalCreature, kindTag)
}

// removalProfileCase is a removal card and the kind, restriction and Spot
// flag it should classify as.
type removalProfileCase struct {
	card        types.Card
	kind        string
	restriction string
	spot        bool
}

func TestClassifyRemoval_KindsAndRestrictions(t *testing.T) {
	for _, tc := range []removalProfileCase{
		{spotRemoval("Murderous Cut", "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nDestroy target creature.", tagRemovalDestroy), "destroy", "any creature (delve)", true},
		{spotRemoval("Path to Exile", "Exile target creature. Its controller may search their library for a basic land card.", tagRemovalExile), "exile", "any creature", true},
		{spotRemoval("Doom Blade", "Destroy target nonblack creature.", tagRemovalDestroy), "destroy", "any creature, nonblack", true},
		{spotRemoval("Shriekmaw", "Evoke {1}{B}\nWhen this creature enters, destroy target nonartifact, nonblack creature.", tagRemovalDestroy), "destroy", "any creature, nonblack", true},
		{spotRemoval("Oblivion Ring", "When this enchantment enters, exile another target nonland permanent.", tagRemovalExile), "exile", "any creature", true},
		{spotRemoval("Oust", "Put target creature into its owner's library second from the top. Its controller gains 3 life.", tagRemovalTuck), "tuck", "any creature", true},
		{removalCard("Prison Term", "Enchant creature\nEnchanted creature can't attack or block.", tagSpotRemoval, types.RoleRemovalCreature), "pacify", "any creature", true},
		{spotRemoval("Plummet", "Destroy target creature with flying.", tagRemovalDestroy), "destroy", "any creature, fliers", true},
		{spotRemoval("Disfigure", "Target creature gets -2/-2 until end of turn.", types.RoleRemovalToughness), "shrink", "toughness ≤ 2", true},
		{spotRemoval("Nameless Inversion", "Target creature gets +3/-3 and loses all creature types until end of turn.", types.RoleRemovalToughness), "shrink", "toughness ≤ 3", true},
		{spotRemoval("Scar", "Put a -1/-1 counter on target creature.", types.RoleRemovalToughness), "shrink", "toughness ≤ 1", true},
		{spotRemoval("Abrade", "Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact.", tagBurnCreature), "damage", "toughness ≤ 3", true},
		{spotRemoval("Fire // Ice", "Fire deals 2 damage divided as you choose among one or two targets.", tagBurnCreature), "damage", "toughness ≤ 2", true},
		{spotRemoval("Comet Storm", "Choose any target, then choose another target for each time this spell was kicked. Comet Storm deals X damage to each of them.", tagBurnCreature), "damage", "scalable (X damage)", true},
		{spotRemoval("Spitemare", "Whenever this creature is dealt damage, it deals that much damage to any target.", tagBurnCreature), "damage", "scalable (damage equal to)", true},
		{spotRemoval("Hunter's Talent", "Target creature you control deals damage equal to its power to target creature you don't control.", tagOneSidedFight), "fight", "scalable (fight)", true},
		{spotRemoval("Cut Down", "Destroy target creature with total power and toughness 5 or less.", tagRemovalDestroy), "destroy", "P+T ≤ 5", true},
		{spotRemoval("Bloodchief's Thirst", "Kicker {2}{B}\nDestroy target creature or planeswalker with mana value 2 or less. If this spell was kicked, instead destroy that permanent.", tagRemovalDestroy), "destroy", "MV ≤ 2 (kicker: any)", true},
		{spotRemoval("Glass Casket", "Exile target creature an opponent controls with mana value 3 or less.", tagRemovalExile), "exile", "MV ≤ 3", true},
		{spotRemoval("Power Cap", "Destroy target creature with power 3 or less.", tagRemovalDestroy), "destroy", "power ≤ 3", true},
		{spotRemoval("Cap Without Black", "Destroy target nonblack creature with mana value 3 or less.", tagRemovalDestroy), "destroy", "MV ≤ 3, nonblack", true},
		{spotRemoval("Red Cap", "Destroy target red creature with power 2 or less.", tagRemovalDestroy), "destroy", "power ≤ 2, red only", true},

		// Removal the page doesn't score keeps a kind of its own.
		{removalCard("Toxic Deluge", "All creatures get -X/-X until end of turn.", types.RoleSweeper, types.RoleRemovalCreature), "sweeper", "", false},
		{spotRemoval("Diabolic Edict", "Target player sacrifices a creature.", tagRemovalSacrifice), "edict", "", false},
		{spotRemoval("Jace, the Mind Sculptor", "−1: Return target creature to its owner's hand.", tagRemovalBounce), "tempo", "", false},
		{removalCard("Smash to Smithereens", "Destroy target artifact.", tagSpotRemoval, tagRemovalDestroy), "other", "", false},
		{removalCard("Brion Stoutarm", "{R}, {T}, Sacrifice a creature other than Brion Stoutarm: It deals damage equal to the sacrificed creature's power to target player or planeswalker.", tagSpotRemoval), "other", "", false},

		// Tagged as burning creatures, but the only creature damage hits each
		// creature, and the targeted damage only reaches players.
		{spotRemoval("Incendiary Command", "Choose two —\n• Incendiary Command deals 4 damage to target player or planeswalker.\n• Incendiary Command deals 2 damage to each creature.", tagBurnCreature), "unclassified", "", false},
	} {
		t.Run(tc.card.Name, func(t *testing.T) {
			profile := classifyRemoval(tc.card)
			assert.Equal(t, tc.kind, profile.Kind)
			assert.Equal(t, tc.restriction, profile.Restriction)
			assert.Equal(t, tc.spot, profile.Spot)
		})
	}
}

func TestClassifyRemoval_LimitsSetTheirCaps(t *testing.T) {
	profile := classifyRemoval(spotRemoval("Toughness Cap", "Exile target creature with toughness 4 or less.", tagRemovalExile))
	assert.Equal(t, 4, profile.MaxToughness)
	assert.Equal(t, 0, profile.MaxPower)

	profile = classifyRemoval(spotRemoval("Doom Blade", "Destroy target nonblack creature.", tagRemovalDestroy))
	assert.Equal(t, "B", profile.ColorExclude)
	assert.Equal(t, 0, profile.MaxToughness, "an unconditional kill has no toughness cap")

	profile = classifyRemoval(spotRemoval("Plummet", "Destroy target creature with flying.", tagRemovalDestroy))
	assert.True(t, profile.FlyingOnly)
	profile = classifyRemoval(spotRemoval("Murder", "Destroy target creature.", tagRemovalDestroy))
	assert.False(t, profile.FlyingOnly, "a flier elsewhere in the text doesn't limit the target")
}

func TestClassifyRemoval_TagsDecideNotText(t *testing.T) {
	// Text that reads like removal, without the tags, isn't removal.
	assert.Equal(t, RemovalProfile{}, classifyRemoval(types.Card{Name: "Untagged", OracleText: "Destroy target creature."}))

	// Removal of creatures without the spot-removal tag isn't scored.
	profile := classifyRemoval(removalCard("Curse of Chains", "Enchant creature\nAt the beginning of each upkeep, tap enchanted creature.", types.RoleRemovalCreature))
	assert.False(t, profile.Spot)
	assert.Equal(t, "other", profile.Kind)
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

	// Delve never drives the cost below zero.
	assert.Equal(t, 0, effectiveCost(types.Card{Name: "Over Delver", CMC: 1, ManaCost: "{4}", OracleText: "Delve\nDestroy target creature."}))

	// Plain spell: printed mana value (no X guessing).
	assert.Equal(t, 2, effectiveCost(types.Card{Name: "Whatever", CMC: 2, ManaCost: "{1}{B}", OracleText: "Destroy target creature with toughness 2 or less."}))
}

func TestClassifyRemoval_ScalableX(t *testing.T) {
	// A literal X in damage stays scalable rather than being force-fit to a number.
	p := classifyRemoval(spotRemoval("Fireball", "Fireball deals X damage to target creature.", tagBurnCreature))
	assert.True(t, p.Spot)
	assert.True(t, p.Scalable)
	assert.Equal(t, 0, p.MaxToughness)

	// Scalable cards get no fabricated coverage/efficiency.
	rc := buildRemovalCard(types.Card{Name: "Fireball", CMC: 1, ManaCost: "{X}{R}"}, p, 1, []removalTarget{{name: "a", toughness: 1, mv: 1, known: true}}, map[string]int{"a": 1}, 1)
	assert.True(t, rc.Scalable)
	assert.Equal(t, 0, rc.Targets)
	assert.Equal(t, 0.0, rc.ReachEff)
}

func TestKillable(t *testing.T) {
	small := removalTarget{name: "Elf", power: 1, toughness: 1, mv: 1, colors: []string{"G"}, known: true}
	big := removalTarget{name: "Titan", power: 6, toughness: 6, mv: 6, colors: []string{"G"}, known: true}
	star := removalTarget{name: "Tarmogoyf", mv: 2, colors: []string{"G"}, known: false}
	flier := removalTarget{name: "Bird", power: 1, toughness: 1, mv: 1, flying: true, known: true}

	anyCreature := RemovalProfile{}
	assert.True(t, anyCreature.killable(small))
	assert.True(t, anyCreature.killable(big))
	assert.True(t, anyCreature.killable(star), "unconditional removal kills even unknown-P/T creatures")

	tough2 := RemovalProfile{MaxToughness: 2}
	assert.True(t, tough2.killable(small))
	assert.False(t, tough2.killable(big))
	assert.False(t, tough2.killable(star), "can't confirm a variable-size body against a toughness limit")

	mv3 := RemovalProfile{MaxMV: 3}
	assert.True(t, mv3.killable(small))
	assert.False(t, mv3.killable(big))
	assert.True(t, mv3.killable(star), "MV is known even when P/T isn't")

	flyOnly := RemovalProfile{FlyingOnly: true}
	assert.False(t, flyOnly.killable(small))
	assert.True(t, flyOnly.killable(flier))

	power1 := RemovalProfile{MaxPower: 1}
	assert.True(t, power1.killable(small))
	assert.False(t, power1.killable(big))

	ptSum := RemovalProfile{MaxPTSum: 2}
	assert.True(t, ptSum.killable(small))
	assert.False(t, ptSum.killable(big))

	nonGreen := RemovalProfile{ColorExclude: "G"}
	assert.False(t, nonGreen.killable(small))
	assert.True(t, nonGreen.killable(flier), "colorless is not green")

	redOnly := RemovalProfile{ColorOnly: "R"}
	assert.False(t, redOnly.killable(small))
	assert.False(t, redOnly.killable(flier), "colorless is not red")

	hexproof := removalTarget{name: "Bogle", power: 1, toughness: 1, mv: 1, known: true, untargetable: true}
	assert.False(t, anyCreature.killable(hexproof), "nothing targets hexproof")
}

// Coverage counts scale with restrictiveness, and both efficiency metrics use the
// effective cost.
func TestRemovalCoverage(t *testing.T) {
	creatures := []removalTarget{
		{name: "a", power: 1, toughness: 1, mv: 1, known: true},
		{name: "b", power: 3, toughness: 3, mv: 3, known: true},
		{name: "c", power: 5, toughness: 5, mv: 6, known: true},
	}
	numPlaysByCard := map[string]int{
		"a": 10,
		"b": 5,
		"c": 1,
	}
	total := 16

	uncond := buildRemovalCard(
		types.Card{Name: "Doom", CMC: 2, ManaCost: "{1}{B}", OracleText: "Destroy target creature."},
		classifyRemoval(spotRemoval("Doom", "Destroy target creature.", tagRemovalDestroy)),
		2,
		creatures,
		numPlaysByCard,
		total,
	)
	assert.Equal(t, 3, uncond.Targets)
	assert.Equal(t, 100.0, uncond.PctCube)
	assert.Equal(t, 6, uncond.MaxMVKilled)
	assert.Equal(t, 100.0, uncond.PctPlayed)

	// Reach = ceiling (6) - cost (2) = 4; avg = (1+3+6)/3 - 2 = 1.3.
	assert.InDelta(t, 4.0, uncond.ReachEff, 0.01)
	assert.InDelta(t, 1.3, uncond.Efficiency, 0.1)

	// Glass-Casket-style MV≤3 at cost 2: reach = 3 - 2 = +1 (matches intuition),
	// average pulled down by cheap creatures.
	casket := buildRemovalCard(
		types.Card{Name: "Casket", CMC: 2, ManaCost: "{1}{W}", OracleText: "exile target creature with mana value 3 or less."},
		classifyRemoval(spotRemoval("Casket", "exile target creature with mana value 3 or less.", tagRemovalExile)),
		2,
		creatures,
		numPlaysByCard,
		total,
	)
	assert.Equal(t, 3, casket.MaxMVKilled)
	assert.Equal(t, 2, casket.Targets, "the 6-mana creature is out of reach")
	assert.InDelta(t, 66.7, casket.PctCube, 0.05)
	assert.InDelta(t, 1.0, casket.ReachEff, 0.01)

	// Play weighting: a (10 plays) and b (5) of 16 total, avg MV (10*1+5*3)/15 = 1.67.
	assert.InDelta(t, 93.8, casket.PctPlayed, 0.05)
	assert.InDelta(t, 1.7, casket.PlayedAvgMVKilled, 0.05)
	assert.InDelta(t, -0.3, casket.PlayedEfficiency, 0.05)
	assert.Equal(t, "exile", casket.Kind)
}

// spot groups one removal card's modes and rows for the hard-to-remove and
// per-color tests. Each profile becomes a row with the given cube coverage.
func spot(name string, colors []string, pct float64, profiles ...RemovalProfile) spotCard {
	sc := spotCard{colors: colors}
	for _, p := range profiles {
		sc.modes = append(sc.modes, p)
		sc.rows = append(sc.rows, RemovalCard{Name: name, Colors: colors, Scalable: p.Scalable, PctCube: pct, PctPlayed: pct})
	}
	return sc
}

// findHardToRemoveRow returns a creature's row by name.
func findHardToRemoveRow(t *testing.T, rows []HardToRemoveRow, name string) HardToRemoveRow {
	t.Helper()
	for _, r := range rows {
		if r.Name == name {
			return r
		}
	}
	t.Fatalf("no row for %s", name)
	return HardToRemoveRow{}
}

var (
	bearTarget  = removalTarget{name: "Bear", power: 2, toughness: 2, mv: 2, known: true}
	giantTarget = removalTarget{name: "Giant", power: 5, toughness: 5, mv: 5, known: true}
	smallBurn   = RemovalProfile{Spot: true, Kind: "damage", MaxToughness: 2}
	murder      = RemovalProfile{Spot: true, Kind: "destroy"}
)

func TestHardToRemove_FewestAnswersFirst(t *testing.T) {
	cards := []spotCard{spot("Shock", []string{"R"}, 30, smallBurn), spot("Murder", []string{"B"}, 100, murder)}
	rows := hardToRemove(cards, []removalTarget{bearTarget, giantTarget})

	assert.Equal(t, "Giant", rows[0].Name)
	assert.Equal(t, 1, rows[0].Answers[""])
	assert.Equal(t, 2, findHardToRemoveRow(t, rows, "Bear").Answers[""])
}

func TestHardToRemove_CountsPerColor(t *testing.T) {
	cards := []spotCard{
		spot("Shock", []string{"R"}, 30, smallBurn),
		spot("Murder", []string{"B"}, 100, murder),
		spot("Ratchet Bomb", nil, 100, murder),
	}
	giant := findHardToRemoveRow(t, hardToRemove(cards, []removalTarget{giantTarget}), "Giant")

	assert.Equal(t, 2, giant.Answers["B"], "black removal plus colorless")
	assert.Equal(t, 1, giant.Answers["R"], "only the colorless card")
	assert.Equal(t, 1, giant.Answers["G"])
	assert.Equal(t, 2, giant.Answers[""])
}

func TestHardToRemove_MultiModeCountsOnce(t *testing.T) {
	kicker := spot("Bloodchief's Thirst", []string{"B"}, 50, RemovalProfile{Spot: true, MaxMV: 2}, murder)
	bear := findHardToRemoveRow(t, hardToRemove([]spotCard{kicker}, []removalTarget{bearTarget}), "Bear")
	assert.Equal(t, 1, bear.Answers[""])
}

func TestHardToRemove_UnknownStatsCountsOnlyUnrestricted(t *testing.T) {
	tarmogoyf := removalTarget{name: "Tarmogoyf", mv: 2, known: false}
	cards := []spotCard{spot("Shock", []string{"R"}, 30, smallBurn), spot("Murder", []string{"B"}, 100, murder)}
	row := findHardToRemoveRow(t, hardToRemove(cards, []removalTarget{tarmogoyf}), "Tarmogoyf")
	assert.Equal(t, 1, row.Answers[""])
}

func TestHardToRemove_ScalableCountsWhenRestrictionsAllow(t *testing.T) {
	fireball := spot("Fireball", []string{"R"}, 0, RemovalProfile{Spot: true, Kind: "damage", Scalable: true})
	flyingOnly := spot("Plummet", []string{"G"}, 10, RemovalProfile{Spot: true, FlyingOnly: true})
	giant := findHardToRemoveRow(t, hardToRemove([]spotCard{fireball, flyingOnly}, []removalTarget{giantTarget}), "Giant")
	assert.Equal(t, 1, giant.Answers[""], "Fireball can kill anything given mana; Plummet needs a flier")
}

func TestRemovalByColor_CountsAndMedian(t *testing.T) {
	cards := []spotCard{
		spot("A", []string{"B"}, 20, murder),
		spot("B", []string{"B"}, 50, murder),
		spot("C", []string{"W", "B"}, 80, murder),
	}
	rows := removalByColor(cards)

	black := rows[2]
	assert.Equal(t, "B", black.Color)
	assert.Equal(t, 3, black.Cards)
	assert.Equal(t, 50.0, black.MedianPctCube)
	assert.Equal(t, 1, rows[0].Cards, "the W/B card counts under white too")
}

func TestRemovalByColor_EmptyColor(t *testing.T) {
	rows := removalByColor([]spotCard{spot("Ratchet Bomb", nil, 40, murder)})

	var order []string
	for _, r := range rows {
		order = append(order, r.Color)
	}
	assert.Equal(t, []string{"W", "U", "B", "R", "G", "C"}, order)
	assert.Equal(t, RemovalColorRow{Color: "G", Cards: 0, MedianPctCube: -1, MedianPctPlayed: -1}, rows[4])
	assert.Equal(t, 1, rows[5].Cards)
	assert.Equal(t, 40.0, rows[5].MedianPctCube)
}

func TestRemovalByColor_MedianUsesBestModeAndSkipsScalable(t *testing.T) {
	kicker := spot("Thirst", []string{"B"}, 0, RemovalProfile{Spot: true, MaxMV: 2}, murder)
	kicker.rows[0].PctCube, kicker.rows[1].PctCube = 30, 90
	fireball := spot("Fireball", []string{"B"}, 0, RemovalProfile{Spot: true, Scalable: true})

	black := removalByColor([]spotCard{kicker, fireball})[2]
	assert.Equal(t, 2, black.Cards)
	assert.Equal(t, 90.0, black.MedianPctCube, "Fireball has no coverage, and Thirst counts at its best mode")
}

func TestToRemovalTarget_Untargetable(t *testing.T) {
	creature := func(text string) types.Card {
		return types.Card{Name: "x", Types: []string{"Creature"}, Power: "1", Toughness: "1", OracleText: text}
	}
	assert.True(t, toRemovalTarget(creature("Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nEnchanted creature gets +1/+1.")).untargetable)
	assert.True(t, toRemovalTarget(creature("Flying, shroud")).untargetable)
	assert.False(t, toRemovalTarget(creature("Flying, hexproof from blue")).untargetable, "hexproof from one color leaves the rest")
	assert.False(t, toRemovalTarget(creature("As long as you control an Elf, this creature has shroud.")).untargetable, "conditional shroud")
	assert.False(t, toRemovalTarget(creature("Target creature gains hexproof until end of turn.")).untargetable)
}

func TestHardToRemove_HexproofHasNoAnswers(t *testing.T) {
	bogle := removalTarget{name: "Slippery Bogle", power: 1, toughness: 1, mv: 1, known: true, untargetable: true}
	cards := []spotCard{spot("Murder", []string{"B"}, 100, murder)}
	row := findHardToRemoveRow(t, hardToRemove(cards, []removalTarget{bogle, bearTarget}), "Slippery Bogle")
	assert.Equal(t, 0, row.Answers[""])
}

func TestRemovalColors_AddColorless(t *testing.T) {
	assert.Equal(t, []string{"W", "U", "B", "R", "G", "C"}, removalColors)
	assert.Equal(t, []string{"W", "U", "B", "R", "G"}, manaColors, "building removalColors leaves manaColors alone")
}

func TestHardToRemove_OneRowPerCreatureName(t *testing.T) {
	cards := []spotCard{spot("Murder", []string{"B"}, 100, murder)}
	rows := hardToRemove(cards, []removalTarget{bearTarget, giantTarget, bearTarget})
	assert.Len(t, rows, 2, "a cube with two copies of a creature lists it once")
}
