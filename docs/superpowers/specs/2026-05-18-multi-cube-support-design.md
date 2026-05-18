# Multi-cube support

## Background

cube-tools was built around a single cube. `polyverse` is hardcoded in ~15 Go files (every stats handler, the storage cache, several commands, the notes write path) and in the frontend (`Fetch.js`, `DeckViewer.js`). An `aurora/` directory already sits alongside `polyverse/` on disk but is unreachable through the UI or API.

The goal is to support an arbitrary number of cubes — a user can land on a cube picker, navigate into one cube, and switch between cubes from the navbar without losing their place in the app.

## Goals

- Multiple cubes coexist on disk under `data/<cube-id>/`, each fully independent.
- Cube identity is part of the URL on both the frontend and the API.
- Adding a new cube is a one-line change to a registry file plus dropping data into a new directory.
- No silent default cube. Code that needs to know which cube it is operating on must be told explicitly.

## Non-goals

- Cross-cube aggregation, comparisons, or shared views. Every view is scoped to a single cube. If cross-cube ever becomes a real need, it lives under a separate `/api/cubes/...` namespace and gets its own design.
- Authentication or per-cube access control.
- Migration of existing on-disk JSON files. Files that embed `data/polyverse/...` paths inside their JSON keep working as-is — those paths already include the cube name.

## Design

### Cube registry

A new file `data/cubes.json` is the source of truth for which cubes exist:

```json
{
  "cubes": [
    {"id": "polyverse", "name": "Polyverse", "description": "..."},
    {"id": "aurora",    "name": "Aurora",    "description": "..."}
  ]
}
```

- `id` is both the directory name under `data/` and the path segment used in URLs.
- Loaded once at server start.
- Exposed via a new global endpoint `GET /api/cubes` that returns the list. The frontend landing page and the navbar cube dropdown both read from this endpoint.
- Any request for a cube ID not in the registry returns 404.

### Backend

**Routing.** All previously global cube-scoped endpoints move under `/api/{cube}/...`:

- `/api/{cube}/decks`
- `/api/{cube}/archetypes`
- `/api/{cube}/stats/cards`
- `/api/{cube}/stats/colors`
- `/api/{cube}/stats/synergy`
- `/api/{cube}/stats/archetypes`
- `/api/{cube}/stats/players`
- `/api/{cube}/stats/design-graph`
- `/api/{cube}/save-notes` (POST)
- `/api/{cube}/save-design-rules` (POST)

Plus the new global `/api/cubes`. The router extracts the cube ID from the path and threads it into each handler. Handlers validate the ID against the registry and return 404 if it is not registered.

**Storage.** `pkg/storage/decks.go` today holds a single `s.cache` and calls `loadDecks("polyverse")`. Change `cache` to `map[string]*cubeCache` keyed by cube ID, populated lazily on first request per cube. The existing cache-invalidation behavior is preserved per cube.

**Stats handlers.** Every `types.LoadCube("data/polyverse/cube.json")` (and `cube-rules.json`) becomes `types.LoadCube("data/" + cube + "/cube.json")`, where `cube` comes from the route param. Files touched: `pkg/server/stats/cards.go`, `colors.go`, `synergy.go`, `archetypes.go`, `players.go`, `designgraph.go`, plus any `data/polyverse` reference in `pkg/server/notes.go`.

**Write-path validation.** `pkg/server/notes.go` currently validates `strings.HasPrefix(cleanPath, "data/polyverse")`. Replace with a check that the path is under `data/<cube>/` for the cube from the route, and that the cube ID is in the registry. Same treatment for the `save-design-rules` handler that writes `data/polyverse/cube-rules.json`.

**CLI commands.** `parse`, `reparse`, `index`, `import_hedron`, `deck_utils`, and `parse_dir` all hardcode `data/polyverse/...`. Each gets a `--cube` flag (some already do). The hardcoded path becomes `data/<cube>/...`. No default value — the flag is required. Requiring it prevents silently regressing to "always polyverse," which is the bug being removed.

### Frontend

**Routing.** HashRouter routes become cube-scoped:

- `/` — landing page, lists cubes from `/api/cubes`
- `/{cube}/stats/...` — existing Cards/Colors/Players/Types/Synergy/Drafts sub-views
- `/{cube}/decks` and `/{cube}/decks/...`
- `/{cube}/dogs`

The cube ID is read from route params and exposed to descendants via a small React context so navbar and the API client can read it without prop-drilling through every page.

**API client.** `ui/src/utils/Fetch.js` currently fetches `data/polyverse/cube.json` and `data/polyverse/index.json` as static files, and hits `/api/...` for everything else. Both kinds of call get parameterized by cube ID read from context: static fetches become `data/{cube}/cube.json` / `data/{cube}/index.json` (the files already live there), and API calls become `/api/{cube}/...`. No new static endpoints are added — the existing on-disk layout already gives us per-cube static files.

**DeckViewer.** The two `data/polyverse/...` report-markdown fetches in `DeckViewer.js` become `data/{cube}/...` using the cube from context/route.

**Navbar.** A new cube dropdown lists the cubes from `/api/cubes`. Selecting a cube navigates to the equivalent route in the target cube, preserving the sub-path where it applies (e.g., `/polyverse/stats/cards` → `/aurora/stats/cards`).

**Landing page.** New top-level component at `/`. Fetches `/api/cubes` and renders a simple list of cube cards (name + description). Each card links into that cube's default view (`/{cube}/stats`).

## Testing

- Unit tests for the cube registry loader (valid file, missing file, malformed entries).
- Unit tests for the route-param → handler plumbing on at least one stats handler (404 on unknown cube, correct data path on known cube).
- Unit test for the notes write-path validator: rejects paths outside `data/<cube>/`, rejects unknown cubes, rejects `..` traversal as today.
- Manual smoke test: landing page lists both cubes; entering each cube renders its decks and stats; navbar dropdown swaps cubes while preserving sub-path.

## Out of scope / future

- Per-cube color themes or branding.
- Cross-cube player stats (lives under a future `/api/cubes/...` namespace if it becomes real).
- Migration tooling for renaming a cube ID after the fact.
