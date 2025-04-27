# cube-tools

This repository is meant to help parse, track, and analyze **Magic: The Gathering** draft results.

You can find [my cube on Cube Cobra](https://cubecobra.com/cube/overview/polyversal)

There are a few parts to this repository:

- A Golang binary that parses various deck input formats, merges them with other metadata, and stores them for posterity.
- A very basic React site to run locally for viewing statistics compiled from the parsed deck and draft data.
- JSON formatted draft logs from applicable drafts (i.e., those done with draftmancer)
- Historical cube snapshots taken at the time of each draft.
- Replay files from Cockatrice (where applicable).

Data for each draft can be found in [data](data). Structure is as follows:

```
data/                        # data root directory, with a sub-directory per-cube.
|-- <cube-name>/             # cube directory
   |-- cube.json             # current cube JSON file.
   |-- index.json            # auto-generated index file of decks.
   |-- YYYY-MM-DD/           # draft directory containing per-draft information.
      |-- player.json        # deck file for <player>
      |-- player.report.md   # optional report markdown file for this deck.
      |-- cube-snapshot.json # snapshot of the cube at this date.
      |-- draft-log.json     # optional draft log from Draftmancer.com
      |-- replays/           # optional cockatrice replays directory.
```

The above file structure is largely generated using the Go tool provided.

## Building the go tool

Build all tools with `make`.

Help text can be retrieved with `./bin/parser -h`:

```
Parse and manage cube-tools data files.

Usage:
  Parse [command]

Available Commands:
  completion      Generate the autocompletion script for the specified shell
  diff            Show the difference between two cube files
  edit            Edit an existing deck file
  help            Help about any command
  index           Regenerate index files for the drafts directory.
  parse           Parse a single deck file
  parse-dir       Parse a directory of deck files
  parse-draft-log Parse a draft log
  reparse         Reparse existing data files to update them

Flags:
  -h, --help   help for Parse

Use "Parse [command] --help" for more information about a command.
```

## Adding draft information

Create a temporary directory and download / create deck files within.

To parse the decks within the directory:

```
./bin/parser \
    -deck-dir ~/Downloads/draft/ \     # Path to deck files.
    -date 2024-01-07 \                 # Date to assign.
    -p Prefix \                        # Optional prefix to match for each deck file.
    -filetype ".txt"                   # Filetype to check.
```

Optional next steps:

- Add replays to `replays/`
- Add a `draft-log.json`
- Update parsed `player.json` files with labels.

You can then add match information. e.g., the following adds a match that was won 2-1 by player1.

```
DATE=2024-01-07 ./bin/parser edit add-match -p player1 -o player2 -r "2-1"
```

Finally, index the new draft information so it can be discovered by the UI:

```
./bin/parser index
```

## Updating metadata

To run a full regeneration of the draft data (e.g., to pull in updated oracle text and other metadata):

```
make reparse
```

## Adding draft logs

Each draft can optionally include a log exported from draftmancer including draft pick ordering. This is included in the UI.

Draft logs are found at `drafts/YYYY-MM-DD/draft-log.json`

## Running the UI

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

Cockatrice replay files are stored in `data/polyverse/YYYY-MM-DD/replays/`
