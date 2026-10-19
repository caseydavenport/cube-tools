// Design tokens shared by the Mantine theme and the legacy CSS bridge. Kept free of
// imports so node tests can load it directly.

// PRIMARY_SHADES is the "sylvan" violet scale Mantine needs, lightest first.
export const PRIMARY_SHADES = [
  "#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa",
  "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95",
]

// LIGHT is the light-mode palette: page and card backgrounds, text and muted
// text, borders, the sidebar gradient's two ends, and good/bad result colors.
export const LIGHT = {
  page: "#fbf8f4",
  card: "#ffffff",
  text: "#2a2238",
  muted: "#7a6f86",
  border: "#ece4ee",
  sidebarFrom: "#f3e8ff",
  sidebarTo: "#ffe4e1",
  good: "#16a34a",
  bad: "#e11d48",
}

// DARK is the dark-mode palette, with the same keys as LIGHT.
export const DARK = {
  page: "#1a1625",
  card: "#231d31",
  text: "#f4effa",
  muted: "#a69cb5",
  border: "#342b45",
  sidebarFrom: "#2a1f3d",
  sidebarTo: "#3a1f2c",
  good: "#4ade80",
  bad: "#fb7185",
}

// MANA colors match the land icons in public/img, so they don't change by scheme.
export const MANA = {
  W: "#f3e29d",
  U: "#80c1e7",
  B: "#9c91c9",
  R: "#f08676",
  G: "#93c775",
}

// SERIES colors chart lines and bars that don't stand for a Magic color. Each
// reads on both the light and dark page, and none matches a MANA color.
export const SERIES = [
  "#8b5cf6", "#14b8a6", "#f59e0b", "#f43f5e",
  "#0ea5e9", "#84cc16", "#d946ef", "#64748b",
]
