// The Charts page's slice: reading it from and writing it to the URL, the
// starting presets, and the plain-language caption that says what the
// result shows. Kept free of React so node tests can load it.

// DEFAULT_SLICE is the slice the Charts page opens with: every color, counted
// in every deck it appears in, by win rate.
export const DEFAULT_SLICE = {
  groupBy: { dim: "color", granularity: 1, color_mode: "inclusive" },
  splitBy: { dim: "", granularity: 1, color_mode: "inclusive" },
  metric: "win_pct",
  bucketSize: 3,
  predicates: [],
}

// PRESETS are starting slices the Charts page offers as one-click buttons.
export const PRESETS = [
  {
    id: "color-vs-color",
    label: "My color vs theirs",
    slice: {
      groupBy: { dim: "color", granularity: 1, color_mode: "inclusive" },
      splitBy: { dim: "opponent_color", granularity: 1, color_mode: "inclusive" },
      metric: "win_pct",
    },
  },
  {
    id: "archetype-vs-archetype",
    label: "Archetype vs archetype",
    slice: {
      groupBy: { dim: "archetype", granularity: 1, color_mode: "inclusive" },
      splitBy: { dim: "opponent_archetype", granularity: 1, color_mode: "inclusive" },
      metric: "win_pct",
    },
  },
  {
    id: "player-over-time",
    label: "Player over time",
    slice: {
      groupBy: { dim: "time", granularity: 1, color_mode: "inclusive" },
      splitBy: { dim: "player", granularity: 1, color_mode: "inclusive" },
      metric: "win_pct",
    },
  },
]

// SLICE_PARAMS are the URL parameter names the slice uses. The date range and
// deck filter keep their own app-wide parameters.
const SLICE_PARAMS = ["group", "group_size", "group_mode", "split", "split_size", "split_mode", "metric", "bucket", "filters"]

// readSide reads one side of the slice (group or split) from params, falling
// back to fallback for anything missing or unreadable.
function readSide(params, prefix, fallback) {
  const size = Number(params.get(`${prefix}_size`))
  return {
    dim: params.has(prefix) ? params.get(prefix) : fallback.dim,
    granularity: size >= 1 && size <= 3 ? size : fallback.granularity,
    color_mode: params.get(`${prefix}_mode`) || fallback.color_mode,
  }
}

// readPredicates parses the filters parameter, a JSON list, or returns none
// when it's missing or not a list.
function readPredicates(params) {
  if (!params.has("filters")) {
    return []
  }
  try {
    const parsed = JSON.parse(params.get("filters"))
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch (e) {
    // A hand-edited or truncated URL just loses its filters.
  }
  return []
}

// sliceFromParams reads a slice from URL search params, using the default for
// anything the URL doesn't set.
export function sliceFromParams(params) {
  const bucket = Number(params.get("bucket"))
  return {
    groupBy: readSide(params, "group", DEFAULT_SLICE.groupBy),
    splitBy: readSide(params, "split", DEFAULT_SLICE.splitBy),
    metric: params.get("metric") || DEFAULT_SLICE.metric,
    bucketSize: bucket >= 1 ? bucket : DEFAULT_SLICE.bucketSize,
    predicates: readPredicates(params),
  }
}

// writeSlice returns params with the slice written in and every other
// parameter, like the date range, kept.
export function writeSlice(params, slice) {
  const next = new URLSearchParams(params)
  for (const name of SLICE_PARAMS) {
    next.delete(name)
  }
  next.set("group", slice.groupBy.dim)
  next.set("group_size", String(slice.groupBy.granularity))
  next.set("group_mode", slice.groupBy.color_mode)
  if (slice.splitBy.dim) {
    next.set("split", slice.splitBy.dim)
    next.set("split_size", String(slice.splitBy.granularity))
    next.set("split_mode", slice.splitBy.color_mode)
  }
  next.set("metric", slice.metric)
  next.set("bucket", String(slice.bucketSize))
  if (slice.predicates.length > 0) {
    next.set("filters", JSON.stringify(slice.predicates))
  }
  return next
}

// sliceQuery is the query string for a link that opens the Charts page on a
// slice, with defaults filled in for whatever partial leaves out.
export function sliceQuery(partial) {
  const slice = { ...DEFAULT_SLICE, ...partial }
  return writeSlice(new URLSearchParams(), slice).toString()
}

// ROW_NOUNS say, in words, what one row or column of each dimension holds.
const ROW_NOUNS = {
  color: (size) => `decks of one ${["", "color", "color pair", "three-color group"][size] || "color group"}`,
  opponent_color: (size) => `opponents of one ${["", "color", "color pair", "three-color group"][size] || "color group"}`,
  archetype: () => "decks of one macro archetype",
  opponent_archetype: () => "opponents of one macro archetype",
  label: () => "decks with one tag",
  player: () => "one player's decks",
  time: (size, bucket) => `decks from ${bucket} drafts in a row`,
  removal: () => "decks with that many removal spells",
  interaction: () => "decks with that many removal spells and counterspells",
  counterspell: () => "decks with that many counterspells",
  creatures: () => "decks with that many creatures",
  lands: () => "decks with that many lands",
  avg_cmc: () => "decks with that average mana value",
  dna: () => "decks with that many DNA-tagged cards",
  opponent_removal: () => "opponents with that many removal spells",
  opponent_creatures: () => "opponents with that many creatures",
  opponent_avg_cmc: () => "opponents with that average mana value",
}

// COLOR_MODE_SENTENCES say how a deck is counted toward color groups.
const COLOR_MODE_SENTENCES = {
  inclusive: "A deck counts once for every color group its colors cover.",
  exact: "A deck counts only in the color group that matches its colors exactly.",
  primary: "A deck counts in its main color pair, ignoring a splash.",
}

// METRIC_SENTENCES say what the metric measures.
const METRIC_SENTENCES = {
  win_pct: "Win % is the share of games won, pulled toward 50% for groups with few games. Grey means it can't be told apart from a coin flip.",
  record: "Record is the games won, lost and drawn.",
  games: "Games counts the games played.",
}

// rowNoun is what one entry of a dimension holds, in words.
function rowNoun(side, bucketSize) {
  const noun = ROW_NOUNS[side.dim]
  if (!noun) {
    return "decks"
  }
  return noun(side.granularity, bucketSize)
}

// usesColor reports whether either side of the slice groups by color.
function usesColor(slice) {
  return ["color", "opponent_color"].includes(slice.groupBy.dim) || ["color", "opponent_color"].includes(slice.splitBy.dim)
}

// colorModeOf is the color mode of whichever side groups by color, the group
// side first.
function colorModeOf(slice) {
  if (["color", "opponent_color"].includes(slice.groupBy.dim)) {
    return slice.groupBy.color_mode
  }
  return slice.splitBy.color_mode
}

// chartsCaption is one or two plain sentences under the controls saying what
// the result shows: what a row is, what a cell is when split, how decks are
// counted toward colors, and what the metric means. It's built from the same
// slice that builds the request, so it can't drift from what's drawn.
export function chartsCaption(slice) {
  const sentences = [`Each row is ${rowNoun(slice.groupBy, slice.bucketSize)}.`]
  if (slice.splitBy.dim) {
    const column = rowNoun(slice.splitBy, slice.bucketSize)
    if (slice.splitBy.dim.startsWith("opponent_")) {
      sentences.push(`Each cell is how the row's decks did against ${column}.`)
    } else {
      sentences.push(`Each cell narrows the row to ${column}.`)
    }
  }
  if (usesColor(slice)) {
    sentences.push(COLOR_MODE_SENTENCES[colorModeOf(slice)] || "")
  }
  if (slice.predicates.length > 0) {
    sentences.push("Only decks matching the filters count.")
  }
  sentences.push(METRIC_SENTENCES[slice.metric] || "")
  return sentences.filter(Boolean).join(" ")
}
