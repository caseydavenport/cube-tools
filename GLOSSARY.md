# Cube tools

Stats on the decks a play group drafts from its Magic: The Gathering cubes, judged against rules for which cards work together.

## Cubes and drafts

**Cube**:
A curated card list the group drafts from, such as Defender of the Polyverse or The Great Aurora.
_Avoid_: set, list (alone)

**Today's list**:
The cards the cube holds now.
_Avoid_: current cube, catalog

**Draft**:
One session where players drafted the cube and built decks.
_Avoid_: event, pod

**Draft list**:
The cards the cube held at one draft, saved with that draft.
_Avoid_: snapshot (in prose)

**Cut card**:
A card an old draft list or deck held that today's list doesn't.

**Deck**:
The cards one player built and played at one draft, with their match record.

## Design rules

**Rules**:
A cube's groups and packages, together.
_Avoid_: config, design map

**Group**:
A named set of cards picked out by search conditions, minus any cards it excludes.
_Avoid_: tag, category

**Condition**:
One search a group uses to pick out cards.
_Avoid_: query, rule (for one search)

**Exclude list**:
The cards a group names to keep out even when a condition matches them.
_Avoid_: blocklist, exceptions

**Member**:
A card in a group: it meets one of the group's conditions and the exclude list doesn't name it.
_Avoid_: match (alone)

**Card entry**:
A wire side's direct reference to one card by name instead of a group.

**Wire**:
A link between two sides of groups or card entries whose cards work together. An Enables wire has enablers on one side and payoffs on the other; a Pairs with wire's sides simply go well together.
_Avoid_: edge, link (for the rule itself)

**Package**:
A named strategy made of one or more wires.
_Avoid_: archetype, theme, synergy

**Build-around**:
A card a deck can be built around, which can stand in for the rest of its wire side.

**Built**:
A deck builds a package when it plays enough cards from both sides of one of its wires.
_Avoid_: has, contains, uses

**Rulebook**:
A cube's rules resolved against its cards: which cards fill each group and wire side, and where each package is supported.

## Relevance

**Supported**:
A draft list supports a package when it holds enough of the package's cards to build it.
_Avoid_: present, available

**Override**:
A cube's choice to force a package on or off everywhere, whatever its lists support.
_Avoid_: pin, toggle

**Relevant**:
A package is relevant to a draft when that draft's list supports it, after overrides.

**Shown**:
The packages a view names: those relevant to the drafts it covers, or to today's list when it covers none.
_Avoid_: visible, filtered
