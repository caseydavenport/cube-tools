# cube-tools

Tools for recording and analyzing cube drafts: the decks people built, how those decks performed, and what that says about the cube's design.

## Drafts and decks

**Cube**:
A curated list of cards that drafts are run from.
_Avoid_: list, set

**Draft**:
One event where a group of players drafted from a cube. Each draft is identified by a number that increments as drafts are added.
_Avoid_: event, pod, session

**Event**:
The occasion a draft was held at, such as a store night or a tournament. An event has a name and a short event code, and one event can hold several drafts.
_Avoid_: tournament (for events in general)

**Flight**:
One of several drafts run within the same event.
_Avoid_: pod, round (for a flight)

**Deck**:
What one player built and played in one draft. A deck has an identity of its own: a number unique within its draft that never changes, independent of who played it.
_Avoid_: entry, seat, player (as a synonym for deck)

**Player**:
The name of the person who played a deck. A player name is an editable property of a deck, not its identity.
_Avoid_: drafter, user

**Notes**:
Free-form write-up about a deck, kept as part of the deck.
_Avoid_: report, description

## Results

**Match**:
One pairing between two decks in a draft, scored in games won, lost and drawn.
_Avoid_: pairing, game (for the whole pairing)

**Round**:
The position of a match in the draft's schedule, so the same two decks can meet more than once.

**Game**:
A single game within a match.

**Record**:
A deck's full set of matches in its draft.
_Avoid_: results, score
