# cube-tools

This repository is meant to help parse, track, and analyze **Magic: The Gathering** draft results.

You can find [my cube on Cube Cobra](https://cubecobra.com/cube/overview/polyversal)

Right now, it really just takes CSV decklist files from [Delver Lens](https://www.delverlab.com/), merges them with
other metadata, and stores it for posterity. Eventually, this repository will include other analysis tools to measure
cube behavior over time. For example:

- Track player win rates
- Track color pair, card, archetype and play style win rates
- Track draft data like pick count, mainboard and sideboard rate, etc.

Old drafts can be found in [drafts](drafts).

## Building

Build all tools with `make`

## Parsing decks

To parse a deck:

```
./bin/parser -deck input.csv \
    -who player_name \
    -wins 2 \
    -losses 2 \
    -labels aggro,sacrifice \
    -date YYYY-MM-DD
```

The resulting files will be stored at `drafts/YYYY-MM-DD/player_name.json`
