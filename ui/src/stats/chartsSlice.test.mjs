import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_SLICE, PRESETS, chartsCaption, sliceFromParams, sliceQuery, writeSlice } from "./chartsSlice.js"

test("an empty URL gives the default slice", () => {
  assert.deepEqual(sliceFromParams(new URLSearchParams()), DEFAULT_SLICE)
})

test("a slice survives a round trip through the URL", () => {
  const slice = {
    groupBy: { dim: "archetype", granularity: 1, color_mode: "inclusive" },
    splitBy: { dim: "opponent_color", granularity: 2, color_mode: "exact" },
    metric: "record",
    bucketSize: 5,
    predicates: [{ dim: "player", op: "is", value: "Freddie" }],
  }
  assert.deepEqual(sliceFromParams(writeSlice(new URLSearchParams(), slice)), slice)
})

test("writing a slice keeps the date range and deck filter", () => {
  const params = writeSlice(new URLSearchParams("start=2024-01-01&match=arch%3Aaggro"), DEFAULT_SLICE)
  assert.equal(params.get("start"), "2024-01-01")
  assert.equal(params.get("match"), "arch:aggro")
  assert.equal(params.get("group"), "color")
})

test("unreadable filters and sizes fall back", () => {
  const slice = sliceFromParams(new URLSearchParams("filters=%7Bnot-json&group_size=9"))
  assert.deepEqual(slice.predicates, [])
  assert.equal(slice.groupBy.granularity, 1)
})

test("a link query fills in defaults around the parts it sets", () => {
  const slice = sliceFromParams(new URLSearchParams(sliceQuery({ groupBy: { dim: "archetype", granularity: 1, color_mode: "inclusive" } })))
  assert.equal(slice.groupBy.dim, "archetype")
  assert.equal(slice.metric, "win_pct")
})

test("the caption names rows, cells, counting and the metric", () => {
  const caption = chartsCaption({ ...DEFAULT_SLICE, ...PRESETS[0].slice, bucketSize: 3, predicates: [] })
  assert.equal(caption,
    "Each row is decks of one color. Each cell is how the row's decks did against opponents of one color. " +
    "A deck counts once for every color group its colors cover. " +
    "Win % is the share of games won, pulled toward 50% for groups with few games. Grey means it can't be told apart from a coin flip.")
})

test("a caption without color or split skips those sentences", () => {
  const caption = chartsCaption({ ...DEFAULT_SLICE, groupBy: { dim: "player", granularity: 1, color_mode: "inclusive" }, metric: "games" })
  assert.equal(caption, "Each row is one player's decks. Games counts the games played.")
})

test("filters add a sentence to the caption", () => {
  const caption = chartsCaption({ ...DEFAULT_SLICE, predicates: [{ dim: "player" }], metric: "record" })
  assert.match(caption, /Only decks matching the filters count\./)
})
