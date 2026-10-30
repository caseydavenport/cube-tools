// Card roles and tags come from Scryfall's oracle tags, which the server
// attaches to cards. Deck cards carry only their role tags (roles); card
// stats rows carry every tag (oracle_tags).

// tagSlug turns a tag spelling into Scryfall's slug form: lowercase, without
// quotes, with spaces read as hyphens.
function tagSlug(name) {
  return name.replaceAll('"', "").trim().toLowerCase().replaceAll(" ", "-")
}

// cardTags returns the tags the card carries: the full list when it has one,
// otherwise just its roles.
function cardTags(card) {
  if (card.oracle_tags) {
    return card.oracle_tags
  }
  if (card.roles) {
    return card.roles
  }
  return []
}

// cardHasOracleTag reports whether the card carries the named tag. It reads
// slugs only, so an alias the server would resolve (creature-removal) doesn't
// match here.
export function cardHasOracleTag(card, name) {
  return cardTags(card).includes(tagSlug(name))
}

// hasRole reports whether a card carries one of the role tags the server
// sends with every card, such as "removal" or "counterspell".
export function hasRole(card, slug) {
  return (card.roles || []).includes(slug)
}

// isRemoval reports whether Scryfall tags the card as removal of any kind.
export function isRemoval(card) {
  return hasRole(card, "removal")
}

// isCounterspell reports whether Scryfall tags the card as a counterspell.
export function isCounterspell(card) {
  return hasRole(card, "counterspell")
}

// isInteraction reports whether the card interacts with an opponent's game:
// removal, a counterspell or hand disruption.
export function isInteraction(card) {
  return isRemoval(card) || isCounterspell(card) || hasRole(card, "hand-disruption")
}

// cardMatchesTagFilter reports whether a card stats row passes the Cards
// page's Scryfall tag filter. With no tag chosen, every card passes.
export function cardMatchesTagFilter(card, slug) {
  if (!slug) {
    return true
  }
  return cardHasOracleTag(card, slug)
}
