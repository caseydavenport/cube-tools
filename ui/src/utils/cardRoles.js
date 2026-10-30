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
