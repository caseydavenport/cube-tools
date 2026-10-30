package types

import "slices"

// Role tags are the Scryfall oracle tags the code acts on. Tier 1 drives the
// interaction counts, tier 2 splits removal, and tier 3 names the cubes' themes.
const (
	RoleRemoval        = "removal"
	RoleCounterspell   = "counterspell"
	RoleHandDisruption = "hand-disruption"
	RoleDraw           = "draw"
	RoleLifegain       = "lifegain"
	RoleDiscardOutlet  = "discard-outlet"

	RoleRemovalCreature    = "removal-creature"
	RoleSweeper            = "sweeper"
	RoleRemovalArtifact    = "removal-artifact"
	RoleRemovalEnchantment = "removal-enchantment"
	RoleRemovalToughness   = "removal-toughness"

	RoleMillSelf         = "mill-self"
	RoleReanimate        = "reanimate"
	RoleRecursion        = "recursion"
	RoleHateGraveyard    = "hate-graveyard"
	RoleRamp             = "ramp"
	RoleManaDork         = "mana-dork"
	RoleFetchland        = "fetchland"
	RoleLandfall         = "landfall"
	RoleSacrificeOutlet  = "sacrifice-outlet"
	RoleFlicker          = "flicker"
	RoleTutor            = "tutor"
	RoleLoot             = "loot"
	RoleTapper           = "tapper"
	RoleUntapper         = "untapper"
	RoleMill             = "mill"
	RoleCantrip          = "cantrip"
	RoleBurn             = "burn"
	RoleProtectsCreature = "protects-creature"
)

// RoleTags lists every role tag, tier by tier.
var RoleTags = []string{
	RoleRemoval, RoleCounterspell, RoleHandDisruption, RoleDraw, RoleLifegain, RoleDiscardOutlet,
	RoleRemovalCreature, RoleSweeper, RoleRemovalArtifact, RoleRemovalEnchantment, RoleRemovalToughness,
	RoleMillSelf, RoleReanimate, RoleRecursion, RoleHateGraveyard, RoleRamp, RoleManaDork,
	RoleFetchland, RoleLandfall, RoleSacrificeOutlet, RoleFlicker, RoleTutor, RoleLoot,
	RoleTapper, RoleUntapper, RoleMill, RoleCantrip, RoleBurn, RoleProtectsCreature,
}

// rolesIn returns the role tags among a card's sorted oracle tags, in the
// same sorted order, or nil when it has none.
func rolesIn(tags []string) []string {
	var roles []string
	for _, tag := range tags {
		if slices.Contains(RoleTags, tag) {
			roles = append(roles, tag)
		}
	}
	return roles
}

// HasRole reports whether the card carries the given oracle tag, directly or
// through a narrower tag under it.
func (c Card) HasRole(slug string) bool {
	_, found := slices.BinarySearch(c.OracleTags, slug)
	return found
}

// IsRemoval reports whether Scryfall tags the card as removal of any kind,
// including sweepers, edicts and creatures that take a card from a hand.
func (c Card) IsRemoval() bool {
	return c.HasRole(RoleRemoval)
}

// IsCounterspell reports whether Scryfall tags the card as a counterspell.
func (c Card) IsCounterspell() bool {
	return c.HasRole(RoleCounterspell)
}

// IsHandDisruption reports whether the card makes an opponent discard or
// takes cards from their hand.
func (c Card) IsHandDisruption() bool {
	return c.HasRole(RoleHandDisruption)
}

// IsCardDraw reports whether the card draws cards.
func (c Card) IsCardDraw() bool {
	return c.HasRole(RoleDraw)
}

// IsLifegain reports whether the card gains life.
func (c Card) IsLifegain() bool {
	return c.HasRole(RoleLifegain)
}

// IsGraveyard reports whether the card builds a graveyard plan: it mills its
// controller, reanimates, or returns cards from the graveyard. Graveyard hate
// doesn't count.
func (c Card) IsGraveyard() bool {
	return c.HasRole(RoleMillSelf) || c.HasRole(RoleReanimate) || c.HasRole(RoleRecursion)
}

// IsDiscardOutlet reports whether the card lets its controller discard cards,
// as a cost or an effect.
func (c Card) IsDiscardOutlet() bool {
	return c.HasRole(RoleDiscardOutlet)
}

// IsInteraction reports whether the card interacts with an opponent's game:
// removal, a counterspell or hand disruption.
func (c Card) IsInteraction() bool {
	return c.IsRemoval() || c.IsCounterspell() || c.IsHandDisruption()
}
