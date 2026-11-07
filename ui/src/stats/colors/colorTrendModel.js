// Which color groups the Colors chart over time draws, and the values each
// line takes. Kept free of React so node tests can load it.

export const MONO_COLORS = ["W", "U", "B", "R", "G"]
export const DUAL_COLORS = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"]
export const TRIO_COLORS = ["WUB", "WUR", "WUG", "WBR", "WBG", "WRG", "UBR", "UBG", "URG", "BRG"]

// MAX_PICKED is how many color groups the chart draws at once when there are
// more than five to choose from, so the lines stay readable.
export const MAX_PICKED = 3

// TREND_MEASURES are what the chart can show over time. All are about what
// gets built, not how it does, since per-color win rates are mostly noise.
export const TREND_MEASURES = [
  { value: "builds", label: "Build %", field: "build_percent" },
  { value: "pick_percentage", label: "Pick %", field: "total_pick_percentage" },
  { value: "splash", label: "Avg deck devotion", field: "average_deck_percentage" },
]

// groupsFor lists the color groups a color type offers: Mono, Dual, Trio, or
// all of them for Any.
export function groupsFor(colorType) {
  if (colorType === "Mono") {
    return MONO_COLORS
  }
  if (colorType === "Dual") {
    return DUAL_COLORS
  }
  if (colorType === "Trio") {
    return TRIO_COLORS
  }
  return [...MONO_COLORS, ...DUAL_COLORS, ...TRIO_COLORS]
}

// needsPicker reports whether a color type has too many groups to draw at
// once, so the chart asks which to show.
export function needsPicker(colorType) {
  return groupsFor(colorType).length > MONO_COLORS.length
}

// defaultPicks are the MAX_PICKED groups of the color type built most often
// in colorData, a map from color group to its row.
export function defaultPicks(colorData, colorType) {
  const groups = groupsFor(colorType).filter(group => colorData.has(group))
  groups.sort((a, b) => colorData.get(b).build_percent - colorData.get(a).build_percent)
  return groups.slice(0, MAX_PICKED)
}

// shownGroups are the groups the chart draws: every group when the color type
// needs no picker, else the picked ones that belong to it, or the defaults
// when none of the picks do.
export function shownGroups(picked, colorData, colorType) {
  if (!needsPicker(colorType)) {
    return groupsFor(colorType)
  }
  const offered = new Set(groupsFor(colorType))
  const kept = (picked || []).filter(group => offered.has(group)).slice(0, MAX_PICKED)
  if (kept.length > 0) {
    return kept
  }
  return defaultPicks(colorData, colorType)
}

// measureField is the color row field a measure reads, Build % by default.
export function measureField(measure) {
  for (const option of TREND_MEASURES) {
    if (option.value === measure) {
      return option.field
    }
  }
  return TREND_MEASURES[0].field
}

// seriesFor is one group's values across the time buckets, null where a
// bucket has no decks of that group so the line breaks instead of dropping.
export function seriesFor(buckets, group, measure) {
  const field = measureField(measure)
  return buckets.map(bucket => {
    const row = (bucket.data || {})[group]
    if (!row) {
      return null
    }
    return row[field]
  })
}
