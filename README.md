# cube-tools

This repository is meant to help parse, track, and analyze **Magic: The Gathering** draft results.

You can find [my cube on Cube Cobra](https://cubecobra.com/cube/overview/polyversal)

There are a few parts to this repository:

- A Golang binary that parses various deck input formats, merges them with other metadata, and stores them for posterity.
- A very basic React site to run locally for viewing statistics compiled from the parsed deck and draft data.
- JSON formatted draft logs from applicable drafts (i.e., those done with draftmancer)
- Historical cube snapshots taken at the time of each draft.
- Replay files from Cockatrice (where applicable).

Data for each draft can be found in [drafts](drafts), organized by draft-date.

## Building the go tool

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

To parse a directory containing multiple decks:

```
/bin/parser \
    -deck-dir ~/Downloads/draft/ \
    -date 2024-01-07 \
    -filetype ".txt"
```

The resulting files will be stored at `drafts/YYYY-MM-DD/player_name.json`

## Adding draft logs

Each draft can optionally include a log exported from draftmancer including draft pick ordering. This is included in the UI.

Draft logs are found at `drafts/YYYY-MM-DD/draft-log.json`

## Running the UI

Right now, the UI learns about the existence of draft data from index JSON files that are programmatically
generated. To regenerate them after adding a new draft:

```
make index
```

If you haven't already, install node dependencies:

```
cd ui
npm install
```

Then, you can start the UI by running the following in the `ui` directory:

```
npm start
```

## Cockatrice replays

Cockatrice replay files are stored in `drafts/YYYY-MM-DD/replays/`
